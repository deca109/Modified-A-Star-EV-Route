"""
Modified A* Routing Engine.

Implements three routing algorithms:
1. Shortest Path (Dijkstra by distance)
2. Energy-Aware Routing (A* by energy cost)
3. Modified A* (distance + energy + SoH penalty + charging + traffic)

The Modified A* cost function:
  f(n) = g(n) + h(n)
  g(n) = actual cost so far (weighted sum)
  h(n) = heuristic to goal (energy estimate from geo distance)

Cost weights (configurable):
  w_dist    - distance penalty
  w_energy  - energy cost penalty
  w_soh     - SoH degradation penalty
  w_time    - travel time penalty
  w_traffic - traffic penalty
"""

import heapq
import math
import logging
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass, field

import networkx as nx
import numpy as np

try:
    from backend.utils.graph_loader import haversine_distance
except ImportError:
    from utils.graph_loader import haversine_distance

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────────
# Route result data structure
# ────────────────────────────────────────────────────────────────────────────────

@dataclass
class RouteResult:
    algorithm: str
    path: List[Any]                        # node IDs
    path_coords: List[Tuple[float, float]] # (lat, lon)
    total_distance_km: float
    total_energy_kwh: float
    total_time_min: float
    charging_stops: List[Dict[str, Any]]
    feasible: bool
    soc_final: float
    soh_final: float
    soc_initial: float
    soh_initial: float
    battery_violations: int
    runtime_ms: float
    cost: float
    feasibility_score: float
    path_details: List[Dict[str, Any]] = field(default_factory=list)


# ────────────────────────────────────────────────────────────────────────────────
# Graph builder from dict
# ────────────────────────────────────────────────────────────────────────────────

def build_nx_graph(graph_data: Dict[str, Any]) -> nx.DiGraph:
    """Reconstruct a NetworkX DiGraph from the serialised graph dict."""
    G = nx.DiGraph()
    for n in graph_data["nodes"]:
        G.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    for e in graph_data["edges"]:
        G.add_edge(e["source"], e["target"], **{k: v for k, v in e.items() if k not in ("source", "target")})
    return G


def _nearest_node(G: nx.DiGraph, lat: float, lon: float) -> Any:
    """Find closest node by Euclidean distance in lat/lon."""
    best, best_dist = None, float("inf")
    for node, data in G.nodes(data=True):
        d = math.sqrt((data.get("lat", 0) - lat)**2 + (data.get("lon", 0) - lon)**2)
        if d < best_dist:
            best_dist = d
            best = node
    return best


# ────────────────────────────────────────────────────────────────────────────────
# Algorithm 1: Shortest Path (Dijkstra / distance only)
# ────────────────────────────────────────────────────────────────────────────────

def shortest_path_route(
    G: nx.DiGraph,
    source: Any,
    target: Any,
    initial_soc: float = 0.85,
    initial_soh: float = 0.95,
    capacity_kwh: float = 75.0,
) -> RouteResult:
    """Standard Dijkstra by road distance."""
    import time
    t0 = time.perf_counter()
    try:
        path = nx.dijkstra_path(G, source, target, weight="distance")
    except nx.NetworkXNoPath:
        return _infeasible_route("ShortestPath", initial_soc, initial_soh)

    metrics = _compute_path_metrics(G, path, initial_soc, initial_soh, capacity_kwh)
    runtime = (time.perf_counter() - t0) * 1000
    return RouteResult(
        algorithm="ShortestPath",
        path=path,
        path_coords=_path_coords(G, path),
        total_distance_km=metrics["distance_km"],
        total_energy_kwh=metrics["energy_kwh"],
        total_time_min=metrics["time_min"],
        charging_stops=[],
        feasible=metrics["feasible"],
        soc_final=metrics["soc_final"],
        soh_final=metrics["soh_final"],
        soc_initial=initial_soc,
        soh_initial=initial_soh,
        battery_violations=metrics["violations"],
        runtime_ms=round(runtime, 2),
        cost=metrics["distance_km"],
        feasibility_score=_feasibility_score(metrics),
        path_details=metrics["path_details"],
    )


# ────────────────────────────────────────────────────────────────────────────────
# Algorithm 2: Energy-Aware Routing (A* by energy_cost)
# ────────────────────────────────────────────────────────────────────────────────

def energy_aware_route(
    G: nx.DiGraph,
    source: Any,
    target: Any,
    initial_soc: float = 0.85,
    initial_soh: float = 0.95,
    capacity_kwh: float = 75.0,
) -> RouteResult:
    """A* routing minimising energy cost."""
    import time
    t0 = time.perf_counter()

    target_lat = G.nodes[target].get("lat", 0)
    target_lon = G.nodes[target].get("lon", 0)

    def heuristic(u, v):
        lat = G.nodes[u].get("lat", 0)
        lon = G.nodes[u].get("lon", 0)
        dist = haversine_distance(lat, lon, target_lat, target_lon)
        return dist / 1000.0 * 0.15   # base consumption kWh/km

    try:
        path = nx.astar_path(G, source, target, heuristic=heuristic, weight="energy_cost")
    except nx.NetworkXNoPath:
        return _infeasible_route("EnergyAware", initial_soc, initial_soh)

    metrics = _compute_path_metrics(G, path, initial_soc, initial_soh, capacity_kwh)
    runtime = (time.perf_counter() - t0) * 1000
    return RouteResult(
        algorithm="EnergyAware",
        path=path,
        path_coords=_path_coords(G, path),
        total_distance_km=metrics["distance_km"],
        total_energy_kwh=metrics["energy_kwh"],
        total_time_min=metrics["time_min"],
        charging_stops=[],
        feasible=metrics["feasible"],
        soc_final=metrics["soc_final"],
        soh_final=metrics["soh_final"],
        soc_initial=initial_soc,
        soh_initial=initial_soh,
        battery_violations=metrics["violations"],
        runtime_ms=round(runtime, 2),
        cost=metrics["energy_kwh"],
        feasibility_score=_feasibility_score(metrics),
        path_details=metrics["path_details"],
    )


# ────────────────────────────────────────────────────────────────────────────────
# Algorithm 3: Modified A* (core algorithm)
# ────────────────────────────────────────────────────────────────────────────────

# Replace the _AStarNode dataclass with this leaner version
@dataclass(order=True)
class _AStarNode:
    f_cost: float
    g_cost: float = field(compare=False)
    node: Any = field(compare=False)
    soc: float = field(compare=False)
    soh: float = field(compare=False)
    parent_key: Optional[Tuple] = field(compare=False, default=None)
    charging_stops: List = field(compare=False, default_factory=list)


def modified_astar_route(
    G: nx.DiGraph,
    source: Any,
    target: Any,
    stations: List[Dict[str, Any]],
    initial_soc: float = 0.85,
    initial_soh: float = 0.95,
    capacity_kwh: float = 75.0,
    w_dist: float = 0.20,
    w_energy: float = 0.35,
    w_soh: float = 0.25,
    w_time: float = 0.10,
    w_traffic: float = 0.10,
    soc_min: float = 0.10,
) -> RouteResult:

    import time
    t0 = time.perf_counter()

    station_nodes: Set[Any] = {s["node_id"] for s in stations}
    station_map: Dict[Any, Dict] = {s["node_id"]: s for s in stations}

    target_lat = G.nodes[target].get("lat", 0)
    target_lon = G.nodes[target].get("lon", 0)

    # -------------------------------------------------------------------------
    # Lean heap node — parent pointer only, no path list copy
    # -------------------------------------------------------------------------

    @dataclass(order=True)
    class _AStarNode:
        f_cost: float
        g_cost: float = field(compare=False)
        node: Any = field(compare=False)
        soc: float = field(compare=False)
        soh: float = field(compare=False)
        parent_key: Optional[Tuple] = field(compare=False, default=None)
        charging_stops: List = field(compare=False, default_factory=list)

    # -------------------------------------------------------------------------
    # Heuristic
    # -------------------------------------------------------------------------

    MIN_ENERGY_PER_KM = 0.12

    def heuristic(node_id: Any) -> float:
        lat = G.nodes[node_id].get("lat", 0)
        lon = G.nodes[node_id].get("lon", 0)
        dist_km = haversine_distance(lat, lon, target_lat, target_lon) / 1000.0
        optimistic_energy = dist_km * MIN_ENERGY_PER_KM
        return (
            w_energy * (optimistic_energy / 5.0) +
            w_dist   * (dist_km / 100.0)
        )

    # -------------------------------------------------------------------------
    # Edge Cost Function
    # -------------------------------------------------------------------------

    def edge_cost(
        data: Dict,
        current_soh: float,
        energy_needed: float,
    ) -> Tuple[float, float]:

        distance_km    = data.get("distance", 1000.0) / 1000.0
        travel_time    = data.get("travel_time", 1.0)
        traffic_factor = data.get("traffic_factor", 1.0)

        energy_n  = energy_needed / 5.0
        distance_n = distance_km / 100.0
        time_n    = travel_time / 120.0
        traffic_n = max(0.0, traffic_factor - 1.0)

        depth_of_discharge = energy_needed / max(capacity_kwh * current_soh, 1e-6)
        stress_factor = (
            1.0
            + traffic_n
            + (0.5 if depth_of_discharge > 0.25 else 0.0)
        )
        soh_loss    = 2e-5 * energy_needed * stress_factor * (1.0 + depth_of_discharge)
        soh_penalty = soh_loss * 1000.0

        cost = (
            w_energy  * energy_n  +
            w_dist    * distance_n +
            w_time    * time_n    +
            w_traffic * traffic_n +
            w_soh     * soh_penalty
        )
        return cost, soh_loss

    # -------------------------------------------------------------------------
    # Open Set + came_from for path reconstruction
    # -------------------------------------------------------------------------

    open_heap: List[_AStarNode] = []

    start_key = (source, round(initial_soc, 2), round(initial_soh, 3))

    start = _AStarNode(
        f_cost=heuristic(source),
        g_cost=0.0,
        node=source,
        soc=initial_soc,
        soh=initial_soh,
        parent_key=None,
        charging_stops=[],
    )

    heapq.heappush(open_heap, start)

    # state_key -> node_obj, kept for path reconstruction
    came_from: Dict[Tuple, _AStarNode] = {start_key: start}

    # state_key -> best g_cost seen
    visited: Dict[Tuple, float] = {}

    best_result: Optional[_AStarNode] = None
    best_result_key: Optional[Tuple]  = None

    MAX_HEAP_SIZE = 50_000

    while open_heap:

        # Guard against runaway memory on very dense / unsolvable graphs
        if len(open_heap) > MAX_HEAP_SIZE:
            open_heap = heapq.nsmallest(MAX_HEAP_SIZE // 2, open_heap)
            heapq.heapify(open_heap)

        current = heapq.heappop(open_heap)

        state_key = (
            current.node,
            round(current.soc, 2),
            round(current.soh, 3),
        )

        prev_best = visited.get(state_key)
        if prev_best is not None and current.g_cost >= prev_best:
            continue

        visited[state_key] = current.g_cost

        # ---------------------------------------------------------------------
        # Goal Reached
        # ---------------------------------------------------------------------

        if current.node == target:
            best_result     = current
            best_result_key = state_key
            break

        # ---------------------------------------------------------------------
        # Explore Neighbours
        # ---------------------------------------------------------------------

        for neighbor, edge_data in G[current.node].items():

            energy_needed = edge_data.get("energy_cost", 0.1)
            effective_soc = current.soc
            new_charging_stops = list(current.charging_stops)

            required_soc_drop = energy_needed / max(capacity_kwh * current.soh, 1e-6)

            # -----------------------------------------------------------------
            # Recharge BEFORE Traversal if needed
            # -----------------------------------------------------------------

            if effective_soc - required_soc_drop < soc_min:

                if current.node in station_nodes:
                    station = station_map[current.node]
                    charging_penalty = station.get("wait_time_min", 10) / 60.0
                    effective_soc    = 0.80
                    new_charging_stops.append({
                        "node_id":      current.node,
                        "station_id":   station.get("id", current.node),
                        "station_name": station.get("name", str(current.node)),
                        "charger_type": station.get("charger_type", "DC_Fast"),
                        "wait_time_min": station.get("wait_time_min", 10),
                        "soc_before":   round(current.soc, 4),
                        "soc_after":    0.80,
                    })
                else:
                    continue

            # -----------------------------------------------------------------
            # Traverse Edge
            # -----------------------------------------------------------------

            new_soc = effective_soc - required_soc_drop
            if new_soc <= 0:
                continue

            edge_c, soh_loss = edge_cost(edge_data, current.soh, energy_needed)
            new_soh = max(0.5, current.soh - soh_loss)

            g_new = current.g_cost + edge_c

            # Add charging time penalty if we topped up at this node
            if effective_soc != current.soc:
                g_new += w_time * charging_penalty

            h_new = heuristic(neighbor)
            f_new = g_new + h_new

            new_state_key = (
                neighbor,
                round(new_soc, 2),
                round(new_soh, 3),
            )

            new_node = _AStarNode(
                f_cost=f_new,
                g_cost=g_new,
                node=neighbor,
                soc=new_soc,
                soh=new_soh,
                parent_key=state_key,          # pointer only — no path list copy
                charging_stops=new_charging_stops,
            )

            heapq.heappush(open_heap, new_node)

            # Keep came_from updated with the cheapest route to this state
            prev = came_from.get(new_state_key)
            if prev is None or g_new < prev.g_cost:
                came_from[new_state_key] = new_node

    # -------------------------------------------------------------------------
    # Path Reconstruction helper (defined here to close over came_from)
    # -------------------------------------------------------------------------

    def reconstruct_path(goal_node: _AStarNode) -> List[Any]:
        """Walk parent pointers back to source and return ordered node-ID list."""
        path: List[Any] = []
        current = goal_node
        while current is not None:
            path.append(current.node)
            parent_key = current.parent_key
            current = came_from.get(parent_key) if parent_key is not None else None
        path.reverse()
        return path

    # -------------------------------------------------------------------------
    # Fallback to plain A* if Modified A* found no path
    # -------------------------------------------------------------------------

    is_fallback = False

    if best_result is None:
        is_fallback = True
        try:
            path = nx.astar_path(G, source, target, weight="energy_cost")
            metrics = _compute_path_metrics(G, path, initial_soc, initial_soh, capacity_kwh)
            best_result = _AStarNode(
                f_cost=0,
                g_cost=0,
                node=target,
                soc=metrics["soc_final"],
                soh=metrics["soh_final"],
                parent_key=None,
                charging_stops=[],
            )
        except nx.NetworkXNoPath:
            return _infeasible_route("ModifiedAStar", initial_soc, initial_soh)

    # -------------------------------------------------------------------------
    # Build final path and metrics
    # -------------------------------------------------------------------------

    final_path = path if is_fallback else reconstruct_path(best_result)

    metrics = _compute_path_metrics(G, final_path, initial_soc, initial_soh, capacity_kwh)
    runtime = (time.perf_counter() - t0) * 1000
    is_feasible = not is_fallback and best_result.soc >= soc_min

    return RouteResult(
        algorithm="ModifiedAStar",
        path=final_path,
        path_coords=_path_coords(G, final_path),
        total_distance_km=metrics["distance_km"],
        total_energy_kwh=metrics["energy_kwh"],
        total_time_min=metrics["time_min"],
        charging_stops=best_result.charging_stops,
        feasible=is_feasible,
        soc_final=round(best_result.soc, 4),
        soh_final=round(best_result.soh, 4),
        soc_initial=initial_soc,
        soh_initial=initial_soh,
        battery_violations=metrics["violations"],
        runtime_ms=round(runtime, 2),
        cost=round(best_result.g_cost, 5),
        feasibility_score=_feasibility_score(metrics) if is_feasible else 0.0,
        path_details=metrics["path_details"],
    )
# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

def _compute_path_metrics(
    G: nx.DiGraph,
    path: List[Any],
    initial_soc: float,
    initial_soh: float,
    capacity_kwh: float,
) -> Dict[str, Any]:
    total_dist = total_energy = total_time = 0.0
    violations = 0
    soc = initial_soc
    soh = initial_soh
    path_details = []

    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        if not G.has_edge(u, v):
            continue
        data = G[u][v]
        dist = data.get("distance", 0.0)
        energy = data.get("energy_cost", 0.0)
        time_ = data.get("travel_time", 0.0)

        total_dist  += dist
        total_energy += energy
        total_time  += time_

        delta_soc = energy / (capacity_kwh * soh) if soh > 0 else 0
        soc = max(0, soc - delta_soc)
        soh = max(0.5, soh - 1.5e-5 * delta_soc)
        if soc < 0.10:
            violations += 1

        path_details.append({
            "from": u, "to": v,
            "distance_m": round(dist, 1),
            "energy_kwh": round(energy, 4),
            "time_min": round(time_, 3),
            "soc_after": round(soc, 4),
        })

    return {
        "distance_km": round(total_dist / 1000.0, 3),
        "energy_kwh": round(total_energy, 4),
        "time_min": round(total_time, 2),
        "violations": violations,
        "soc_final": round(soc, 4),
        "soh_final": round(soh, 4),
        "feasible": soc >= 0.05 and len(path) > 1,
        "path_details": path_details,
    }


def _path_coords(G: nx.DiGraph, path: List[Any]) -> List[Tuple[float, float]]:
    return [(G.nodes[n].get("lat", 0), G.nodes[n].get("lon", 0)) for n in path]


def _feasibility_score(metrics: Dict) -> float:
    if not metrics["feasible"]:
        return 0.0
    soc_score = min(1.0, metrics["soc_final"] / 0.5)
    viol_score = max(0.0, 1.0 - metrics["violations"] * 0.2)
    return round((soc_score * 0.6 + viol_score * 0.4), 3)


def _infeasible_route(algorithm: str, soc: float, soh: float) -> RouteResult:
    return RouteResult(
        algorithm=algorithm, path=[], path_coords=[],
        total_distance_km=0, total_energy_kwh=0, total_time_min=0,
        charging_stops=[], feasible=False,
        soc_final=soc, soh_final=soh, soc_initial=soc, soh_initial=soh,
        battery_violations=0, runtime_ms=0, cost=float("inf"),
        feasibility_score=0.0,
    )

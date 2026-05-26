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

@dataclass(order=True)
class _AStarNode:
    f_cost: float
    g_cost: float = field(compare=False)
    node: Any = field(compare=False)
    soc: float = field(compare=False)
    soh: float = field(compare=False)
    parent: Optional[Any] = field(compare=False, default=None)
    path: List = field(compare=False, default_factory=list)
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
    """
    Modified A* algorithm.

    Edge cost:
      c(u,v) = w_energy  × energy_cost
             + w_dist    × distance_norm
             + w_soh     × soh_penalty
             + w_time    × time_norm
             + w_traffic × (traffic_factor - 1)

    soh_penalty = (1 - current_soh) × energy_cost  ← reward preserving SoH

    Heuristic:
      h(n) = geo_distance_to_goal / estimated_range × energy_factor
    """
    import time
    t0 = time.perf_counter()

    station_nodes: Set[Any] = {s["node_id"] for s in stations}
    station_map: Dict[Any, Dict] = {s["node_id"]: s for s in stations}

    target_lat = G.nodes[target].get("lat", 0)
    target_lon = G.nodes[target].get("lon", 0)

    max_range_km = (capacity_kwh * initial_soh * (1 - soc_min)) / 0.18  # km at ~18kWh/100km

    def heuristic(node_id: Any, soh: float) -> float:
        lat = G.nodes[node_id].get("lat", 0)
        lon = G.nodes[node_id].get("lon", 0)
        dist_km = haversine_distance(lat, lon, target_lat, target_lon) / 1000.0
        energy_h = dist_km * 0.18 / soh if soh > 0 else float("inf")
        return (
            w_energy * energy_h +
            w_dist   * (dist_km / max(max_range_km, 1))
        )

    def edge_cost(u: Any, v: Any, data: Dict, current_soh: float) -> float:
        e_cost   = data.get("energy_cost", 0.1)
        dist_n   = data.get("distance", 100.0) / 1000.0 / max(max_range_km, 1)
        time_n   = data.get("travel_time", 1.0) / 60.0
        traffic  = data.get("traffic_factor", 1.0) - 1.0
        soh_pen  = (1.0 - current_soh) * e_cost
        return (w_energy * e_cost + w_dist * dist_n + w_soh * soh_pen +
                w_time * time_n + w_traffic * traffic)

    # Open set (min-heap)
    open_heap: List[_AStarNode] = []
    start_node = _AStarNode(
        f_cost=heuristic(source, initial_soh),
        g_cost=0.0,
        node=source,
        soc=initial_soc,
        soh=initial_soh,
        path=[source],
        charging_stops=[],
    )
    heapq.heappush(open_heap, start_node)

    visited: Dict[Any, Tuple[float, float, float]] = {}  # node → (g_cost, soc, soh)

    best_result: Optional[_AStarNode] = None

    while open_heap:
        current = heapq.heappop(open_heap)

        if current.node == target:
            best_result = current
            break

        # Visited check: allow revisit if significantly better SoC
        prev = visited.get(current.node)
        if prev is not None:
            prev_g, prev_soc, prev_soh = prev
            if current.g_cost >= prev_g and current.soc <= prev_soc:
                continue
        visited[current.node] = (current.g_cost, current.soc, current.soh)

        for neighbor, edge_data in G[current.node].items():
            energy_needed = edge_data.get("energy_cost", 0.1)

            new_soc = current.soc - energy_needed / (capacity_kwh * current.soh)
            new_soh = current.soh - 1.5e-5 * max(0, current.soc - new_soc)
            new_charging_stops = list(current.charging_stops)

            # Battery violation: check if we'd go below minimum
            if new_soc < soc_min:
                if new_soc < 0.0:
                    # Cannot physically reach the neighbor
                    continue
                # Can we charge at this node?
                if neighbor in station_nodes:
                    station = station_map[neighbor]
                    # Charge to 80%
                    new_soc = 0.80
                    new_charging_stops.append({
                        "node_id": neighbor,
                        "station_id": station.get("id", neighbor),
                        "station_name": station.get("name", str(neighbor)),
                        "charger_type": station.get("charger_type", "DC_Fast"),
                        "wait_time_min": station.get("wait_time_min", 10),
                        "soc_before": round(current.soc - energy_needed / (capacity_kwh * current.soh), 4),
                        "soc_after": 0.80,
                    })
                else:
                    # Allow small violations with high penalty
                    new_soc = max(0.01, new_soc)

            e_cost = edge_cost(current.node, neighbor, edge_data, current.soh)
            g_new = current.g_cost + e_cost
            h_new = heuristic(neighbor, new_soh)
            f_new = g_new + h_new

            new_path = current.path + [neighbor]
            heapq.heappush(open_heap, _AStarNode(
                f_cost=f_new,
                g_cost=g_new,
                node=neighbor,
                soc=new_soc,
                soh=new_soh,
                parent=current.node,
                path=new_path,
                charging_stops=new_charging_stops,
            ))

    is_fallback = False
    if best_result is None:
        is_fallback = True
        # Fallback: try NetworkX A* without battery constraints
        try:
            path = nx.astar_path(G, source, target, weight="energy_cost")
            metrics = _compute_path_metrics(G, path, initial_soc, initial_soh, capacity_kwh)
            best_result = _AStarNode(
                f_cost=0, g_cost=0, node=target, soc=metrics["soc_final"], soh=metrics["soh_final"],
                path=path, charging_stops=[]
            )
        except nx.NetworkXNoPath:
            return _infeasible_route("ModifiedAStar", initial_soc, initial_soh)

    path = best_result.path
    metrics = _compute_path_metrics(G, path, initial_soc, initial_soh, capacity_kwh)
    runtime = (time.perf_counter() - t0) * 1000

    is_feasible = (not is_fallback) and (best_result.soc >= 0.05)

    return RouteResult(
        algorithm="ModifiedAStar",
        path=path,
        path_coords=_path_coords(G, path),
        total_distance_km=metrics["distance_km"],
        total_energy_kwh=metrics["energy_kwh"],
        total_time_min=metrics["time_min"],
        charging_stops=best_result.charging_stops,
        feasible=is_feasible,
        soc_final=best_result.soc,
        soh_final=best_result.soh,
        soc_initial=initial_soc,
        soh_initial=initial_soh,
        battery_violations=metrics["violations"],
        runtime_ms=round(runtime, 2),
        cost=best_result.g_cost,
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

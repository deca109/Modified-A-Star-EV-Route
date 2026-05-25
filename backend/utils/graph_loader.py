"""
Graph Loader: Loads road network from OSMnx or generates synthetic fallback.
Nodes = intersections + charging stations
Edges = road segments with energy-aware weights
"""

import os
import json
import math
import random
import pickle
import logging
import hashlib
from typing import Optional, Dict, Any, List, Tuple

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────────
# Energy cost formula
# energy_cost = distance × (1 + abs(slope)) × traffic_factor × speed_factor
# ────────────────────────────────────────────────────────────────────────────────

def compute_energy_cost(
    distance_m: float,
    slope_pct: float = 0.0,
    traffic_factor: float = 1.0,
    speed_kmh: float = 50.0,
    base_consumption: float = 0.15,  # kWh per km base
) -> float:
    """Compute energy cost in kWh for an edge."""
    distance_km = distance_m / 1000.0
    slope_penalty = 1.0 + max(0, slope_pct) * 0.05   # uphill costs more
    regen_bonus   = 1.0 - max(0, -slope_pct) * 0.02  # downhill slight regen
    speed_factor  = 1.0 + max(0, (speed_kmh - 60) / 100)  # high speed penalty
    energy = distance_km * base_consumption * slope_penalty * regen_bonus * traffic_factor * speed_factor
    return max(0.001, energy)


def compute_travel_time(distance_m: float, speed_kmh: float = 50.0, traffic_factor: float = 1.0) -> float:
    """Travel time in minutes."""
    speed_ms = (speed_kmh * 1000) / 3600
    base_time = distance_m / speed_ms / 60
    return base_time * traffic_factor


# ────────────────────────────────────────────────────────────────────────────────
# OSMnx loader (with caching)
# ────────────────────────────────────────────────────────────────────────────────

def _cache_path(city: str) -> str:
    h = hashlib.md5(city.encode()).hexdigest()[:8]
    return os.path.join(os.path.dirname(__file__), "..", "data", f"graph_{h}.pkl")


def load_osm_graph(city: str = "Kuala Lumpur, Malaysia", radius_m: int = 5000) -> Optional[nx.MultiDiGraph]:
    """Load road graph from OSMnx with disk caching."""
    cache = _cache_path(city)
    if os.path.exists(cache):
        logger.info(f"Loading graph from cache: {cache}")
        try:
            with open(cache, "rb") as f:
                return pickle.load(f)
        except Exception as e:
            logger.warning(f"Cache load failed: {e}")

    try:
        import osmnx as ox
        logger.info(f"Fetching OSM graph for: {city}")
        G = ox.graph_from_place(city, network_type="drive", retain_all=False)
        G = ox.speed.add_edge_speeds(G)
        G = ox.speed.add_edge_travel_times(G)
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache, "wb") as f:
            pickle.dump(G, f)
        logger.info(f"Graph cached: {len(G.nodes)} nodes, {len(G.edges)} edges")
        return G
    except Exception as e:
        logger.error(f"OSMnx load failed: {e}")
        return None


# ────────────────────────────────────────────────────────────────────────────────
# Synthetic graph generator
# ────────────────────────────────────────────────────────────────────────────────

def generate_synthetic_graph(
    n_nodes: int = 80,
    center_lat: float = 3.1390,
    center_lon: float = 101.6869,
    spread: float = 0.08,
    seed: int = 42,
) -> nx.DiGraph:
    """
    Generate a realistic synthetic road network graph.
    Returns a DiGraph with lat/lon attributes on nodes and
    distance/energy/time attributes on edges.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    G = nx.DiGraph()

    # ── Node positions (grid-like with jitter for realism) ──
    grid = int(math.ceil(math.sqrt(n_nodes)))
    positions = {}
    node_id = 0
    for i in range(grid):
        for j in range(grid):
            if node_id >= n_nodes:
                break
            lat = center_lat + (i / grid - 0.5) * spread + np_rng.normal(0, spread * 0.05)
            lon = center_lon + (j / grid - 0.5) * spread + np_rng.normal(0, spread * 0.05)
            slope = float(np_rng.normal(0, 3))   # % grade
            is_charging = rng.random() < 0.12     # ~12% nodes are charging stations
            G.add_node(
                node_id,
                lat=round(lat, 6),
                lon=round(lon, 6),
                slope=round(slope, 2),
                is_charging_station=is_charging,
                name=f"Node_{node_id}" if not is_charging else f"CS_{node_id}",
                node_type="charging_station" if is_charging else "intersection",
            )
            positions[node_id] = (lon, lat)
            node_id += 1

    nodes = list(G.nodes())

    # ── Edges: connect nearby nodes (within threshold) ──
    max_dist_deg = spread * 0.3
    for u in nodes:
        u_pos = (G.nodes[u]["lon"], G.nodes[u]["lat"])
        neighbors_added = 0
        # Sort by distance and connect nearest
        dists = []
        for v in nodes:
            if v == u:
                continue
            v_pos = (G.nodes[v]["lon"], G.nodes[v]["lat"])
            d = math.sqrt((u_pos[0] - v_pos[0])**2 + (u_pos[1] - v_pos[1])**2)
            dists.append((d, v))
        dists.sort()
        for d, v in dists[:rng.randint(2, 5)]:   # each node connects to 2-5 neighbors
            if d < max_dist_deg:
                _add_edge(G, u, v, np_rng, rng)
                neighbors_added += 1
        # Guarantee at least 2 edges
        if neighbors_added < 2:
            for d, v in dists[:2]:
                if not G.has_edge(u, v):
                    _add_edge(G, u, v, np_rng, rng)

    # Ensure the graph is (weakly) connected
    if not nx.is_weakly_connected(G):
        components = list(nx.weakly_connected_components(G))
        for i in range(1, len(components)):
            u = rng.choice(list(components[0]))
            v = rng.choice(list(components[i]))
            _add_edge(G, u, v, np_rng, rng)
            _add_edge(G, v, u, np_rng, rng)

    logger.info(f"Synthetic graph: {len(G.nodes)} nodes, {len(G.edges)} edges")
    return G


def _add_edge(G: nx.DiGraph, u: int, v: int, np_rng, rng) -> None:
    """Add a directed edge with realistic attributes."""
    u_lat, u_lon = G.nodes[u]["lat"], G.nodes[u]["lon"]
    v_lat, v_lon = G.nodes[v]["lat"], G.nodes[v]["lon"]
    # Haversine distance
    distance_m = haversine_distance(u_lat, u_lon, v_lat, v_lon)
    slope = (G.nodes[u]["slope"] + G.nodes[v]["slope"]) / 2
    speed_kmh = float(np_rng.choice([30, 40, 50, 60, 80, 100]))
    traffic_factor = float(np_rng.uniform(0.9, 1.8))
    energy = compute_energy_cost(distance_m, slope, traffic_factor, speed_kmh)
    travel_time = compute_travel_time(distance_m, speed_kmh, traffic_factor)
    G.add_edge(
        u, v,
        distance=round(distance_m, 1),
        slope=round(slope, 2),
        speed_kmh=speed_kmh,
        traffic_factor=round(traffic_factor, 3),
        energy_cost=round(energy, 4),
        travel_time=round(travel_time, 3),
        road_type=rng.choice(["residential", "primary", "secondary", "tertiary"]),
    )


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.asin(math.sqrt(a))


# ────────────────────────────────────────────────────────────────────────────────
# Unified loader
# ────────────────────────────────────────────────────────────────────────────────

def get_graph(city: str = "Kuala Lumpur, Malaysia", use_synthetic: bool = False) -> Dict[str, Any]:
    """
    Returns a serialisable dict representation of the road graph.
    Tries OSMnx first, falls back to synthetic.
    """
    G: Optional[nx.DiGraph] = None

    if not use_synthetic:
        osm_G = load_osm_graph(city)
        if osm_G is not None:
            G = _osm_to_standard(osm_G)

    if G is None:
        logger.info("Using synthetic graph fallback")
        G = generate_synthetic_graph()

    return graph_to_dict(G)


def _osm_to_standard(osm_G: nx.MultiDiGraph) -> nx.DiGraph:
    """Convert OSMnx MultiDiGraph to our standard DiGraph."""
    G = nx.DiGraph()
    # Add nodes
    for node, data in osm_G.nodes(data=True):
        G.add_node(
            node,
            lat=data.get("y", 0.0),
            lon=data.get("x", 0.0),
            slope=0.0,
            is_charging_station=False,
            name=str(node),
            node_type="intersection",
        )
    # Add edges (take first parallel edge from MultiDiGraph)
    for u, v, data in osm_G.edges(data=True):
        if G.has_edge(u, v):
            continue
        dist = data.get("length", 100.0)
        speed = data.get("speed_kph", 50.0)
        if isinstance(speed, list):
            speed = float(speed[0])
        traffic = random.uniform(0.9, 1.6)
        energy = compute_energy_cost(dist, 0.0, traffic, speed)
        t_time = compute_travel_time(dist, speed, traffic)
        G.add_edge(u, v,
                   distance=round(dist, 1),
                   slope=0.0,
                   speed_kmh=speed,
                   traffic_factor=round(traffic, 3),
                   energy_cost=round(energy, 4),
                   travel_time=round(t_time, 3),
                   road_type=data.get("highway", "road"))
    return G


def graph_to_dict(G: nx.DiGraph) -> Dict[str, Any]:
    """Serialize graph to JSON-friendly dict."""
    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "id": node_id,
            "lat": data.get("lat", 0.0),
            "lon": data.get("lon", 0.0),
            "slope": data.get("slope", 0.0),
            "is_charging_station": data.get("is_charging_station", False),
            "name": data.get("name", str(node_id)),
            "node_type": data.get("node_type", "intersection"),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "distance": data.get("distance", 0.0),
            "slope": data.get("slope", 0.0),
            "speed_kmh": data.get("speed_kmh", 50.0),
            "traffic_factor": data.get("traffic_factor", 1.0),
            "energy_cost": data.get("energy_cost", 0.1),
            "travel_time": data.get("travel_time", 1.0),
            "road_type": data.get("road_type", "road"),
        })

    return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges)}


# Alias used by main.py
def build_nx_graph_from_dict(graph_data: Dict[str, Any]):
    """Build a networkx DiGraph from a serialised graph dict (alias for astar.build_nx_graph)."""
    import networkx as nx
    G = nx.DiGraph()
    for n in graph_data["nodes"]:
        G.add_node(n["id"], **{k: v for k, v in n.items() if k != "id"})
    for e in graph_data["edges"]:
        G.add_edge(e["source"], e["target"], **{k: v for k, v in e.items() if k not in ("source", "target")})
    return G

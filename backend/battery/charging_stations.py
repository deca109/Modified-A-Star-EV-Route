"""
Charging Station Module: Extracts and manages EV charging stations.
Uses OSM data or generates synthetic stations on the graph.
"""

import random
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict, field

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class ChargingStation:
    id: Any
    node_id: Any
    name: str
    lat: float
    lon: float
    charger_type: str          # AC_L1, AC_L2, DC_Fast, HPC
    power_kw: float
    num_connectors: int
    occupancy_rate: float      # 0–1
    wait_time_min: float
    price_per_kwh: float
    cluster_id: int = -1
    desirability_score: float = 0.5
    operator: str = "Unknown"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


CHARGER_PROFILES = {
    "AC_L1":   {"power_kw": 3.7,  "connectors": 2, "price": 0.15},
    "AC_L2":   {"power_kw": 22.0, "connectors": 4, "price": 0.20},
    "DC_Fast": {"power_kw": 50.0, "connectors": 2, "price": 0.30},
    "HPC":     {"power_kw": 150.0,"connectors": 1, "price": 0.45},
}

OPERATORS = ["Tesla", "ChargePoint", "EVGo", "Blink", "Volta", "Greenlots", "Shell Recharge"]


def generate_synthetic_stations(
    graph_nodes: List[Dict[str, Any]],
    n_stations: int = 15,
    seed: int = 42,
) -> List[ChargingStation]:
    """
    Generate synthetic charging stations by picking random nodes from the graph
    and assigning realistic charging profiles.
    """
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    # Pick candidate nodes (prefer ones not already marked)
    candidates = [n for n in graph_nodes if not n.get("is_charging_station", False)]
    if len(candidates) < n_stations:
        candidates = graph_nodes

    chosen = rng.sample(candidates, min(n_stations, len(candidates)))
    stations: List[ChargingStation] = []

    for i, node in enumerate(chosen):
        charger_type = rng.choices(
            list(CHARGER_PROFILES.keys()),
            weights=[0.10, 0.40, 0.35, 0.15],
        )[0]
        profile = CHARGER_PROFILES[charger_type]
        occupancy = float(np_rng.beta(2, 5))   # skewed low
        wait = max(0.0, occupancy * rng.uniform(10, 45))

        station = ChargingStation(
            id=f"CS_{i:03d}",
            node_id=node["id"],
            name=f"{rng.choice(OPERATORS)} Station #{i+1}",
            lat=node["lat"],
            lon=node["lon"],
            charger_type=charger_type,
            power_kw=profile["power_kw"],
            num_connectors=profile["connectors"],
            occupancy_rate=round(occupancy, 3),
            wait_time_min=round(wait, 1),
            price_per_kwh=profile["price"],
            operator=rng.choice(OPERATORS),
        )
        stations.append(station)

    logger.info(f"Generated {len(stations)} synthetic charging stations")
    return stations


def extract_osm_stations(graph_nodes: List[Dict[str, Any]]) -> List[ChargingStation]:
    """
    Extract charging stations from OSM-loaded nodes.
    Falls back to synthetic if none found.
    """
    osm_stations = [n for n in graph_nodes if n.get("is_charging_station", False)]
    if not osm_stations:
        logger.info("No OSM charging stations found, generating synthetic")
        return generate_synthetic_stations(graph_nodes)

    stations = []
    for i, node in enumerate(osm_stations):
        rng = random.Random(i + 100)
        charger_type = rng.choice(["AC_L2", "DC_Fast"])
        profile = CHARGER_PROFILES[charger_type]
        occupancy = rng.uniform(0.1, 0.7)
        station = ChargingStation(
            id=f"OSM_CS_{i:03d}",
            node_id=node["id"],
            name=node.get("name", f"OSM Station {i}"),
            lat=node["lat"],
            lon=node["lon"],
            charger_type=charger_type,
            power_kw=profile["power_kw"],
            num_connectors=profile["connectors"],
            occupancy_rate=round(occupancy, 3),
            wait_time_min=round(occupancy * 20, 1),
            price_per_kwh=profile["price"],
            operator="OSM",
        )
        stations.append(station)
    return stations


def get_stations_from_graph(graph_data: Dict[str, Any], force_synthetic: bool = False) -> List[ChargingStation]:
    """Main entry: get stations from a graph dict."""
    nodes = graph_data["nodes"]
    if force_synthetic:
        return generate_synthetic_stations(nodes)
    osm_cs = [n for n in nodes if n.get("is_charging_station")]
    if len(osm_cs) < 5:
        return generate_synthetic_stations(nodes)
    return extract_osm_stations(nodes)

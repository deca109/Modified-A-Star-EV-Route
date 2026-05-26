"""
Demo scenario definitions for one-click testing.
"""

from typing import Dict, Any, List

DEMO_SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "short_fail",
        "name": "Short Route Without Battery-Aware Planning",
        "description": "A short route that fails with naive routing but succeeds with Modified A*",
        "icon": "⚡",
        "config": {
            "initial_soc": 0.22,
            "initial_soh": 0.88,
            "source_index": 0,
            "target_index": -1,
            "traffic_scenario": "normal",
            "label": "Low SoC Start",
        },
    },
    {
        "id": "congested_station",
        "name": "Congested Charging Station Reroute",
        "description": "Primary charging station is full; Modified A* reroutes to the next best cluster",
        "icon": "🚧",
        "config": {
            "initial_soc": 0.45,
            "initial_soh": 0.90,
            "source_index": 5,
            "target_index": -5,
            "traffic_scenario": "high_traffic",
            "congested_station": True,
            "label": "Station Congestion",
        },
    },
    {
        "id": "low_soh",
        "name": "Degraded Battery Scenario",
        "description": "Battery is at 70% SoH. Modified A* routes conservatively to preserve health.",
        "icon": "🔋",
        "config": {
            "initial_soc": 0.75,
            "initial_soh": 0.70,
            "source_index": 2,
            "target_index": -3,
            "traffic_scenario": "normal",
            "label": "Low Battery Health",
        },
    },
    {
        "id": "heavy_traffic",
        "name": "Heavy Traffic Rerouting",
        "description": "High traffic multipliers force energy-inefficient routes; Modified A* adapts.",
        "icon": "🚗",
        "config": {
            "initial_soc": 0.80,
            "initial_soh": 0.92,
            "source_index": 10,
            "target_index": -8,
            "traffic_scenario": "heavy",
            "label": "Heavy Traffic",
        },
    },
    {
        "id": "maintenance_warning",
        "name": "Maintenance Warning Scenario",
        "description": "Old battery with many deep discharge cycles triggers critical maintenance alerts.",
        "icon": "🔧",
        "config": {
            "initial_soc": 0.60,
            "initial_soh": 0.65,
            "source_index": 3,
            "target_index": -4,
            "traffic_scenario": "normal",
            "force_maintenance_alert": True,
            "label": "Maintenance Alert",
        },
    },
    {
        "id": "impossible_route",
        "name": "Impossible Range / Out of Charge",
        "description": "Starting SoC is extremely low (0.1%). The destination is unreachable even with intermediate charging. Shortest path still displays on the map but shows as Infeasible.",
        "icon": "🚨",
        "config": {
            "initial_soc": 0.001,
            "initial_soh": 0.85,
            "source_index": 0,
            "target_index": 75,
            "traffic_scenario": "normal",
            "label": "Impossible Route",
        },
    },
]


def get_scenario_config(scenario_id: str) -> Dict[str, Any]:
    for s in DEMO_SCENARIOS:
        if s["id"] == scenario_id:
            return s
    raise ValueError(f"Unknown scenario: {scenario_id}")

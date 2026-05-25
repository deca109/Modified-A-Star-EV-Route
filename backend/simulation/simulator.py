"""
Simulation Engine: Animates the EV along a route, updating SoC/SoH at each step.
Generates step-by-step snapshots for the frontend live animation.
"""

import time
import logging
import random
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict, field

try:
    from backend.battery.battery_simulator import BatterySimulator, DEFAULT_CAPACITY_KWH, DEFAULT_INITIAL_SOC, DEFAULT_INITIAL_SOH
    from backend.routing.astar import RouteResult
except ImportError:
    from battery.battery_simulator import BatterySimulator, DEFAULT_CAPACITY_KWH, DEFAULT_INITIAL_SOC, DEFAULT_INITIAL_SOH
    from routing.astar import RouteResult

logger = logging.getLogger(__name__)


@dataclass
class SimulationStep:
    step: int
    node_id: Any
    lat: float
    lon: float
    soc: float
    soh: float
    speed_kmh: float
    energy_consumed_kwh: float
    cumulative_distance_km: float
    cumulative_time_min: float
    cumulative_energy_kwh: float
    stress_score: float
    event: str          # 'travel' | 'charging' | 'idle' | 'arrived'
    event_detail: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SimulationResult:
    route_algorithm: str
    steps: List[SimulationStep]
    total_distance_km: float
    total_time_min: float
    total_energy_kwh: float
    charging_stops: List[Dict[str, Any]]
    final_soc: float
    final_soh: float
    initial_soc: float
    initial_soh: float
    battery_violations: int
    maintenance_alerts: List[str]
    feasible: bool

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["steps"] = [s.to_dict() for s in self.steps]
        return d


class SimulationEngine:
    """
    Simulates an EV travelling along a computed route.
    Updates battery state at each edge, handles charging stops.
    """

    def __init__(
        self,
        capacity_kwh: float = DEFAULT_CAPACITY_KWH,
        initial_soc: float = DEFAULT_INITIAL_SOC,
        initial_soh: float = DEFAULT_INITIAL_SOH,
    ):
        self.battery = BatterySimulator(
            capacity_kwh=capacity_kwh,
            initial_soc=initial_soc,
            initial_soh=initial_soh,
        )
        self.steps: List[SimulationStep] = []
        self._step_idx = 0

    def run(
        self,
        route: RouteResult,
        graph_data: Dict[str, Any],
        stations: List[Dict[str, Any]],
    ) -> SimulationResult:
        """Run the simulation for a given route."""
        self.battery.reset(self.battery.state.soc, self.battery.state.soh)
        self.steps = []
        self._step_idx = 0

        node_map = {n["id"]: n for n in graph_data["nodes"]}
        edge_map = {(e["source"], e["target"]): e for e in graph_data["edges"]}
        station_map = {s["node_id"]: s for s in stations}

        cumulative_dist = 0.0
        cumulative_time = 0.0
        cumulative_energy = 0.0
        violations = 0

        path = route.path
        if not path:
            return self._empty_result(route.algorithm)

        # Initial step at source
        src = path[0]
        src_data = node_map.get(src, {})
        self._add_step(
            node_id=src,
            lat=src_data.get("lat", 0),
            lon=src_data.get("lon", 0),
            soc=self.battery.state.soc,
            soh=self.battery.state.soh,
            speed=0.0,
            energy=0.0,
            cum_dist=0.0,
            cum_time=0.0,
            cum_energy=0.0,
            stress=0.0,
            event="idle",
            detail="Trip start",
        )

        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            edge = edge_map.get((u, v)) or edge_map.get((v, u))
            v_data = node_map.get(v, {})

            if edge is None:
                # Synthesise edge data
                edge = {"distance": 200, "energy_cost": 0.05, "travel_time": 0.5, "speed_kmh": 40, "traffic_factor": 1.0}

            dist_m  = edge.get("distance", 200.0)
            energy  = edge.get("energy_cost", 0.05)
            t_min   = edge.get("travel_time", 0.5)
            speed   = edge.get("speed_kmh", 40.0)

            cumulative_dist  += dist_m / 1000.0
            cumulative_time  += t_min
            cumulative_energy += energy

            # Discharge
            snap = self.battery.discharge(
                energy_kwh=energy,
                distance_km=dist_m / 1000.0,
                node_id=v,
                lat=v_data.get("lat", 0),
                lon=v_data.get("lon", 0),
            )
            if self.battery.state.soc < 0.10:
                violations += 1

            self._add_step(
                node_id=v,
                lat=v_data.get("lat", 0),
                lon=v_data.get("lon", 0),
                soc=self.battery.state.soc,
                soh=self.battery.state.soh,
                speed=speed,
                energy=energy,
                cum_dist=cumulative_dist,
                cum_time=cumulative_time,
                cum_energy=cumulative_energy,
                stress=snap.get("stress_score", 0.0),
                event="travel",
                detail=f"Travelling edge {u}→{v}",
            )

            # Charging stop?
            is_charging_stop = any(cs.get("node_id") == v for cs in route.charging_stops)
            if is_charging_stop or (v in station_map and self.battery.state.soc < 0.25):
                station = station_map.get(v)
                if station:
                    wait = station.get("wait_time_min", 5.0)
                    charger_kw = station.get("power_kw", 50.0)
                    charge_event = self.battery.charge(
                        station_id=station["id"],
                        station_name=station["name"],
                        target_soc=0.80,
                        charger_kw=charger_kw,
                        charger_type=station.get("charger_type", "AC_L2"),
                        wait_time_min=wait,
                        node_id=v,
                        lat=v_data.get("lat", 0),
                        lon=v_data.get("lon", 0),
                    )
                    cumulative_time += wait + charge_event.charging_time_min
                    self._add_step(
                        node_id=v,
                        lat=v_data.get("lat", 0),
                        lon=v_data.get("lon", 0),
                        soc=self.battery.state.soc,
                        soh=self.battery.state.soh,
                        speed=0.0,
                        energy=-charge_event.energy_added_kwh,
                        cum_dist=cumulative_dist,
                        cum_time=cumulative_time,
                        cum_energy=cumulative_energy,
                        stress=self.battery._stress_score(),
                        event="charging",
                        detail=f"Charging at {station['name']} ({station['charger_type']})",
                    )

        # Arrival
        last = path[-1]
        last_data = node_map.get(last, {})
        self._add_step(
            node_id=last,
            lat=last_data.get("lat", 0),
            lon=last_data.get("lon", 0),
            soc=self.battery.state.soc,
            soh=self.battery.state.soh,
            speed=0.0,
            energy=0.0,
            cum_dist=cumulative_dist,
            cum_time=cumulative_time,
            cum_energy=cumulative_energy,
            stress=self.battery._stress_score(),
            event="arrived",
            detail="Destination reached",
        )

        alerts = self._generate_alerts()

        return SimulationResult(
            route_algorithm=route.algorithm,
            steps=self.steps,
            total_distance_km=round(cumulative_dist, 3),
            total_time_min=round(cumulative_time, 2),
            total_energy_kwh=round(cumulative_energy, 4),
            charging_stops=[asdict(e) for e in self.battery.state.charging_events],
            final_soc=round(self.battery.state.soc, 4),
            final_soh=round(self.battery.state.soh, 4),
            initial_soc=self.battery.state.snapshots[0].soc if self.battery.state.snapshots else 0.85,
            initial_soh=self.battery.state.snapshots[0].soh if self.battery.state.snapshots else 0.95,
            battery_violations=violations,
            maintenance_alerts=alerts,
            feasible=self.battery.state.soc >= 0.05,
        )

    def _add_step(self, node_id, lat, lon, soc, soh, speed, energy, cum_dist, cum_time, cum_energy, stress, event, detail=""):
        self.steps.append(SimulationStep(
            step=self._step_idx,
            node_id=node_id,
            lat=lat, lon=lon,
            soc=round(soc, 4),
            soh=round(soh, 4),
            speed_kmh=round(speed, 1),
            energy_consumed_kwh=round(energy, 4),
            cumulative_distance_km=round(cum_dist, 3),
            cumulative_time_min=round(cum_time, 2),
            cumulative_energy_kwh=round(cum_energy, 4),
            stress_score=round(stress, 4),
            event=event,
            event_detail=detail,
        ))
        self._step_idx += 1

    def _generate_alerts(self) -> List[str]:
        alerts = []
        s = self.battery.state
        if s.soh < 0.75:
            alerts.append("⚠️ Battery health is significantly degraded (SoH < 75%). Consider service.")
        if s.soh < 0.85:
            alerts.append("🔋 Battery health below optimal (SoH < 85%). Monitor closely.")
        if s.deep_discharge_count > 0:
            alerts.append(f"⚡ {s.deep_discharge_count} deep discharge event(s) detected. Avoid frequent deep discharges.")
        if s.soc < 0.15:
            alerts.append("🚨 Battery critically low at destination. Plan for immediate charging.")
        if s.cycle_count > 500:
            alerts.append("🔧 Battery approaching mid-life cycle count. Schedule maintenance check.")
        return alerts

    def _empty_result(self, algorithm: str) -> SimulationResult:
        return SimulationResult(
            route_algorithm=algorithm,
            steps=[],
            total_distance_km=0, total_time_min=0, total_energy_kwh=0,
            charging_stops=[], final_soc=self.battery.state.soc,
            final_soh=self.battery.state.soh,
            initial_soc=self.battery.state.soc,
            initial_soh=self.battery.state.soh,
            battery_violations=0, maintenance_alerts=[], feasible=False,
        )

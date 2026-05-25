"""
Battery Engine: Simulates SoC, SoH, charging events, and degradation.
"""

import math
import logging
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────────────────────────

DEFAULT_CAPACITY_KWH = 75.0    # kWh (e.g. Tesla Model 3 Long Range)
DEFAULT_INITIAL_SOC  = 0.85    # 85%
DEFAULT_INITIAL_SOH  = 0.95    # 95% (near-new battery)
SOC_MIN_THRESHOLD    = 0.10    # 10% safety buffer
SOC_MAX_THRESHOLD    = 0.95    # 95% max charge
CHARGING_RATE_KW     = 50.0    # kW default (Level 2 / DC fast)
FAST_CHARGE_RATE_KW  = 150.0   # kW DC fast charger


# ────────────────────────────────────────────────────────────────────────────────
# Data classes
# ────────────────────────────────────────────────────────────────────────────────

@dataclass
class ChargingEvent:
    station_id: Any
    station_name: str
    soc_before: float
    soc_after: float
    energy_added_kwh: float
    charging_time_min: float
    wait_time_min: float
    charger_type: str = "AC_L2"


@dataclass
class BatterySnapshot:
    step: int
    node_id: Any
    soc: float
    soh: float
    energy_consumed_kwh: float
    cumulative_energy_kwh: float
    cumulative_distance_km: float
    stress_score: float
    lat: float = 0.0
    lon: float = 0.0
    event: str = "travel"   # 'travel' | 'charging' | 'idle'


@dataclass
class BatteryState:
    capacity_kwh: float = DEFAULT_CAPACITY_KWH
    soc: float = DEFAULT_INITIAL_SOC
    soh: float = DEFAULT_INITIAL_SOH
    cycle_count: float = 0.0
    total_energy_discharged: float = 0.0
    total_energy_charged: float = 0.0
    deep_discharge_count: int = 0
    charging_events: List[ChargingEvent] = field(default_factory=list)
    snapshots: List[BatterySnapshot] = field(default_factory=list)
    step: int = 0

    @property
    def usable_energy_kwh(self) -> float:
        return self.capacity_kwh * self.soh * self.soc

    @property
    def max_usable_kwh(self) -> float:
        return self.capacity_kwh * self.soh * (SOC_MAX_THRESHOLD - SOC_MIN_THRESHOLD)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["usable_energy_kwh"] = self.usable_energy_kwh
        d["max_usable_kwh"] = self.max_usable_kwh
        return d


# ────────────────────────────────────────────────────────────────────────────────
# Battery Simulator
# ────────────────────────────────────────────────────────────────────────────────

class BatterySimulator:
    """
    Simulates battery behaviour during an EV route.

    SoC: State of Charge (0–1)
    SoH: State of Health (0–1), degrades over cycles and deep discharges

    Degradation model:
      ΔSoH ≈ α × DoD × (1 + β × (T - T_ref)) × γ × calendar_factor
    Simplified as rule-based with adjustable coefficients.
    """

    def __init__(
        self,
        capacity_kwh: float = DEFAULT_CAPACITY_KWH,
        initial_soc: float = DEFAULT_INITIAL_SOC,
        initial_soh: float = DEFAULT_INITIAL_SOH,
        degradation_alpha: float = 1.5e-5,   # per cycle per DoD unit
        temp_celsius: float = 25.0,
    ):
        self.state = BatteryState(
            capacity_kwh=capacity_kwh,
            soc=initial_soc,
            soh=initial_soh,
        )
        self.alpha = degradation_alpha
        self.temp = temp_celsius
        self._cumulative_energy = 0.0
        self._cumulative_distance = 0.0
        self._soc_at_cycle_start = initial_soc

    # ── Discharge (travel) ──────────────────────────────────────────────────────

    def discharge(
        self,
        energy_kwh: float,
        distance_km: float = 0.0,
        node_id: Any = None,
        lat: float = 0.0,
        lon: float = 0.0,
    ) -> Dict[str, Any]:
        """Consume energy for one edge. Returns updated state dict."""
        effective_capacity = self.state.capacity_kwh * self.state.soh
        delta_soc = energy_kwh / effective_capacity

        soc_before = self.state.soc
        self.state.soc = max(0.0, self.state.soc - delta_soc)
        self.state.total_energy_discharged += energy_kwh
        self._cumulative_energy += energy_kwh
        self._cumulative_distance += distance_km

        # Deep discharge detection
        if self.state.soc < SOC_MIN_THRESHOLD:
            self.state.deep_discharge_count += 1

        # Degrade SoH
        self._degrade(soc_before, self.state.soc)

        stress = self._stress_score()
        snap = BatterySnapshot(
            step=self.state.step,
            node_id=node_id,
            soc=round(self.state.soc, 4),
            soh=round(self.state.soh, 4),
            energy_consumed_kwh=round(energy_kwh, 4),
            cumulative_energy_kwh=round(self._cumulative_energy, 4),
            cumulative_distance_km=round(self._cumulative_distance, 4),
            stress_score=round(stress, 4),
            lat=lat,
            lon=lon,
            event="travel",
        )
        self.state.snapshots.append(snap)
        self.state.step += 1
        return asdict(snap)

    # ── Charging ────────────────────────────────────────────────────────────────

    def charge(
        self,
        station_id: Any,
        station_name: str,
        target_soc: float = SOC_MAX_THRESHOLD,
        charger_kw: float = CHARGING_RATE_KW,
        charger_type: str = "AC_L2",
        wait_time_min: float = 0.0,
        node_id: Any = None,
        lat: float = 0.0,
        lon: float = 0.0,
    ) -> ChargingEvent:
        """Charge battery at a station."""
        soc_before = self.state.soc
        target_soc = min(target_soc, SOC_MAX_THRESHOLD)
        target_soc = max(target_soc, soc_before)

        energy_needed = (target_soc - soc_before) * self.state.capacity_kwh * self.state.soh
        energy_needed = max(0.0, energy_needed)
        charging_time_min = (energy_needed / charger_kw) * 60.0 if charger_kw > 0 else 0.0

        self.state.soc = target_soc
        self.state.total_energy_charged += energy_needed

        # Partial cycle from charging (slight SoH impact from fast charging)
        if charger_type in ("DC_Fast", "HPC"):
            fast_charge_penalty = energy_needed * 1e-5
            self.state.soh = max(0.5, self.state.soh - fast_charge_penalty)

        event = ChargingEvent(
            station_id=station_id,
            station_name=station_name,
            soc_before=round(soc_before, 4),
            soc_after=round(self.state.soc, 4),
            energy_added_kwh=round(energy_needed, 4),
            charging_time_min=round(charging_time_min, 2),
            wait_time_min=round(wait_time_min, 2),
            charger_type=charger_type,
        )
        self.state.charging_events.append(event)

        snap = BatterySnapshot(
            step=self.state.step,
            node_id=node_id,
            soc=round(self.state.soc, 4),
            soh=round(self.state.soh, 4),
            energy_consumed_kwh=-round(energy_needed, 4),
            cumulative_energy_kwh=round(self._cumulative_energy, 4),
            cumulative_distance_km=round(self._cumulative_distance, 4),
            stress_score=round(self._stress_score(), 4),
            lat=lat,
            lon=lon,
            event="charging",
        )
        self.state.snapshots.append(snap)
        self.state.step += 1
        return event

    # ── Degradation ─────────────────────────────────────────────────────────────

    def _degrade(self, soc_before: float, soc_after: float) -> None:
        """Update SoH based on depth of discharge and temperature."""
        dod = max(0.0, soc_before - soc_after)
        temp_factor = 1.0 + max(0, (self.temp - 25) * 0.02)
        delta_soh = self.alpha * dod * temp_factor
        self.state.soh = max(0.5, self.state.soh - delta_soh)
        # Accumulate partial cycle
        self.state.cycle_count += dod * 0.5

    def _stress_score(self) -> float:
        """
        Battery stress 0–1:
        High stress if SoC very low, or SoH degraded, or many deep discharges.
        """
        low_soc_stress = max(0, (0.20 - self.state.soc) / 0.20) if self.state.soc < 0.20 else 0.0
        soh_stress = max(0, (0.80 - self.state.soh) / 0.30)
        cycle_stress = min(1.0, self.state.cycle_count / 1000)
        dd_stress = min(1.0, self.state.deep_discharge_count / 20)
        return min(1.0, (low_soc_stress * 0.35 + soh_stress * 0.35 + cycle_stress * 0.15 + dd_stress * 0.15))

    # ── Feasibility check ───────────────────────────────────────────────────────

    def can_reach(self, required_energy_kwh: float) -> bool:
        """Check if battery has enough charge (with safety buffer)."""
        available = (self.state.soc - SOC_MIN_THRESHOLD) * self.state.capacity_kwh * self.state.soh
        return available >= required_energy_kwh

    def get_summary(self) -> Dict[str, Any]:
        s = self.state
        return {
            "soc": round(s.soc, 4),
            "soh": round(s.soh, 4),
            "capacity_kwh": s.capacity_kwh,
            "usable_energy_kwh": round(s.usable_energy_kwh, 3),
            "cycle_count": round(s.cycle_count, 2),
            "total_energy_discharged_kwh": round(s.total_energy_discharged, 3),
            "total_energy_charged_kwh": round(s.total_energy_charged, 3),
            "deep_discharge_count": s.deep_discharge_count,
            "stress_score": round(self._stress_score(), 4),
            "charging_events": [asdict(e) for e in s.charging_events],
            "snapshots": [asdict(snap) for snap in s.snapshots],
        }

    def reset(self, soc: float = DEFAULT_INITIAL_SOC, soh: float = DEFAULT_INITIAL_SOH) -> None:
        self.state = BatteryState(capacity_kwh=self.state.capacity_kwh, soc=soc, soh=soh)
        self._cumulative_energy = 0.0
        self._cumulative_distance = 0.0

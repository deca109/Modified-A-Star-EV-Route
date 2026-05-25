"""
Predictive Maintenance Module.

Estimates:
  - Battery stress score
  - Health risk level (Low / Moderate / High / Critical)
  - Remaining Useful Life (RUL) in cycles
  - Maintenance warnings

Uses:
  - Rule-based degradation heuristics (primary)
  - RandomForestRegressor for RUL estimation (trained on synthetic data)
"""

import logging
import numpy as np
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────────
# Data classes
# ────────────────────────────────────────────────────────────────────────────────

@dataclass
class MaintenancePrediction:
    battery_stress_score: float       # 0–1
    health_risk_level: str            # Low | Moderate | High | Critical
    rul_cycles: float                 # Remaining useful life in cycles
    rul_km_estimate: float            # Remaining range estimate in km
    warnings: List[str]
    recommendations: List[str]
    confidence: float                 # 0–1
    details: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ────────────────────────────────────────────────────────────────────────────────
# Rule-based predictor
# ────────────────────────────────────────────────────────────────────────────────

class MaintenancePredictor:
    """
    Predictive maintenance engine.

    Primary: rule-based stress + RUL estimate.
    Secondary: RandomForestRegressor for RUL (trained on synthetic degradation data).
    """

    DESIGN_LIFE_CYCLES = 1500       # typical EV battery design life
    KM_PER_CYCLE       = 400.0      # avg km per full equivalent cycle

    def __init__(self):
        self._rf_model = None
        self._model_trained = False
        self._try_train_model()

    def _try_train_model(self) -> None:
        """Train a lightweight RF model on synthetic battery degradation data."""
        try:
            from sklearn.ensemble import RandomForestRegressor
            # Synthetic training data: [soh, cycle_count, deep_discharge, stress] → rul_cycles
            rng = np.random.default_rng(42)
            n = 2000
            soh       = rng.uniform(0.50, 1.00, n)
            cycles    = rng.uniform(0,    1500, n)
            dd_count  = rng.integers(0, 30, n).astype(float)
            stress    = rng.uniform(0.0, 1.0, n)

            # RUL decreases with lower SoH, more cycles, more deep discharges, more stress
            rul = np.clip(
                (soh - 0.50) / 0.50 * self.DESIGN_LIFE_CYCLES
                - cycles
                - dd_count * 5
                - stress * 100
                + rng.normal(0, 20, n),
                0, self.DESIGN_LIFE_CYCLES
            )

            X = np.column_stack([soh, cycles, dd_count, stress])
            self._rf_model = RandomForestRegressor(
                n_estimators=50, max_depth=8, random_state=42, n_jobs=-1
            )
            self._rf_model.fit(X, rul)
            self._model_trained = True
            logger.info("Maintenance RF model trained on synthetic data")
        except Exception as e:
            logger.warning(f"RF model training failed: {e}")
            self._model_trained = False

    def predict(
        self,
        soh: float,
        soc: float,
        cycle_count: float,
        deep_discharge_count: int,
        stress_score: float,
        total_energy_discharged_kwh: float,
        charging_events_count: int,
    ) -> MaintenancePrediction:
        """Generate a maintenance prediction from battery state."""

        # ── RF-based RUL ──
        if self._model_trained:
            feats = np.array([[soh, cycle_count, deep_discharge_count, stress_score]])
            rul_cycles = float(self._rf_model.predict(feats)[0])
        else:
            rul_cycles = self._rule_rul(soh, cycle_count, deep_discharge_count, stress_score)

        rul_cycles = max(0.0, min(rul_cycles, self.DESIGN_LIFE_CYCLES))
        rul_km = rul_cycles * self.KM_PER_CYCLE

        # ── Health risk ──
        risk = self._health_risk(soh, stress_score, rul_cycles)

        # ── Warnings ──
        warnings, recommendations = self._generate_warnings(
            soh, soc, cycle_count, deep_discharge_count, stress_score, charging_events_count
        )

        # ── Confidence ──
        confidence = 0.88 if self._model_trained else 0.72

        return MaintenancePrediction(
            battery_stress_score=round(stress_score, 4),
            health_risk_level=risk,
            rul_cycles=round(rul_cycles, 1),
            rul_km_estimate=round(rul_km, 0),
            warnings=warnings,
            recommendations=recommendations,
            confidence=confidence,
            details={
                "soh": round(soh, 4),
                "soc": round(soc, 4),
                "cycle_count": round(cycle_count, 2),
                "deep_discharge_count": deep_discharge_count,
                "total_energy_discharged_kwh": round(total_energy_discharged_kwh, 2),
                "charging_events": charging_events_count,
                "design_life_cycles": self.DESIGN_LIFE_CYCLES,
                "pct_life_used": round(max(0, 1 - rul_cycles / self.DESIGN_LIFE_CYCLES) * 100, 1),
                "model_type": "RandomForest+Rules" if self._model_trained else "Rules",
            },
        )

    def _rule_rul(self, soh: float, cycles: float, dd: int, stress: float) -> float:
        """Rule-based RUL fallback."""
        base = (soh - 0.50) / 0.50 * self.DESIGN_LIFE_CYCLES
        return max(0, base - cycles - dd * 5 - stress * 100)

    def _health_risk(self, soh: float, stress: float, rul: float) -> str:
        if soh < 0.60 or stress > 0.85 or rul < 100:
            return "Critical"
        elif soh < 0.70 or stress > 0.65 or rul < 300:
            return "High"
        elif soh < 0.80 or stress > 0.45 or rul < 600:
            return "Moderate"
        return "Low"

    def _generate_warnings(
        self,
        soh: float,
        soc: float,
        cycles: float,
        dd: int,
        stress: float,
        charge_events: int,
    ) -> tuple:
        warnings, recs = [], []

        if soh < 0.65:
            warnings.append("🔴 Critical: Battery health severely degraded (SoH < 65%). Immediate replacement advised.")
            recs.append("Replace battery pack as soon as possible.")
        elif soh < 0.75:
            warnings.append("🟠 High: Battery health significantly degraded (SoH < 75%).")
            recs.append("Schedule battery inspection within 30 days.")
        elif soh < 0.85:
            warnings.append("🟡 Moderate: Battery health below optimal (SoH < 85%).")
            recs.append("Monitor battery health monthly.")

        if dd > 5:
            warnings.append(f"⚡ {dd} deep discharge events detected. Deep discharges accelerate degradation.")
            recs.append("Avoid letting SoC drop below 15%. Set charging reminders.")

        if stress > 0.7:
            warnings.append("🔥 High battery stress score. Reduce aggressive acceleration and fast charging.")
            recs.append("Prefer AC charging over DC fast charging when time permits.")

        if cycles > 1000:
            warnings.append(f"🔧 Battery has completed {cycles:.0f} equivalent cycles (design life: 1500).")
            recs.append("Perform comprehensive battery health check.")

        if charge_events > 50:
            warnings.append("🔌 High charging frequency may accelerate calendar aging.")
            recs.append("Keep SoC between 20–80% for optimal longevity.")

        if soc < 0.12:
            warnings.append("🚨 Battery critically low. Risk of deep discharge damage.")
            recs.append("Charge immediately to at least 30% SoC.")

        if not warnings:
            warnings.append("✅ Battery health is normal. No immediate concerns.")
        if not recs:
            recs.append("Maintain regular charging habits and avoid extreme temperatures.")

        return warnings, recs

    def batch_predict_rul(self, history: List[Dict[str, Any]]) -> List[float]:
        """Predict RUL for a series of historical battery states."""
        if not self._model_trained or not history:
            return [self._rule_rul(
                h.get("soh", 0.9), h.get("cycle_count", 0),
                h.get("deep_discharge_count", 0), h.get("stress_score", 0)
            ) for h in history]

        from sklearn.ensemble import RandomForestRegressor
        X = np.array([[
            h.get("soh", 0.9),
            h.get("cycle_count", 0),
            h.get("deep_discharge_count", 0),
            h.get("stress_score", 0),
        ] for h in history])
        return self._rf_model.predict(X).tolist()

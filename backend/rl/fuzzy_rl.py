"""
Fuzzy Reinforcement Learning Station Ranking Module.

Inputs:  SoC, distance_to_station, traffic_factor, wait_time, occupancy, cluster_desirability
Output:  station desirability score (0–1)

Implementation: Fuzzy membership functions + weighted Q-like scoring.
The 'RL' component is represented by the learned weight vector, which could
be updated via Q-learning in future iterations.
"""

import math
import logging
from typing import List, Dict, Any, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────────
# Fuzzy membership functions
# ────────────────────────────────────────────────────────────────────────────────

def _trapezoid(x: float, a: float, b: float, c: float, d: float) -> float:
    """Trapezoidal membership function."""
    if x <= a or x >= d:
        return 0.0
    elif a < x < b:
        return (x - a) / (b - a)
    elif b <= x <= c:
        return 1.0
    else:  # c < x < d
        return (d - x) / (d - c)


def _triangle(x: float, a: float, b: float, c: float) -> float:
    """Triangular membership function."""
    if x <= a or x >= c:
        return 0.0
    elif a < x < b:
        return (x - a) / (b - a)
    else:
        return (c - x) / (c - b)


# ── Membership sets ─────────────────────────────────────────────────────────────

def soc_membership(soc: float) -> Dict[str, float]:
    """SoC fuzzy sets: critical, low, medium, high."""
    return {
        "critical": _trapezoid(soc, 0.0, 0.0, 0.10, 0.20),
        "low":      _triangle(soc,  0.10, 0.25, 0.40),
        "medium":   _triangle(soc,  0.30, 0.55, 0.75),
        "high":     _trapezoid(soc, 0.65, 0.80, 1.0, 1.0),
    }


def distance_membership(dist_km: float, max_range_km: float = 50.0) -> Dict[str, float]:
    """Distance-to-station fuzzy sets: near, moderate, far."""
    norm = min(1.0, dist_km / max_range_km)
    return {
        "near":     _trapezoid(norm, 0.0, 0.0, 0.20, 0.35),
        "moderate": _triangle(norm,  0.25, 0.50, 0.70),
        "far":      _trapezoid(norm, 0.60, 0.80, 1.0, 1.0),
    }


def wait_membership(wait_min: float) -> Dict[str, float]:
    """Wait time fuzzy sets: short, medium, long."""
    return {
        "short":  _trapezoid(wait_min, 0.0, 0.0, 5.0, 15.0),
        "medium": _triangle(wait_min,  10.0, 20.0, 35.0),
        "long":   _trapezoid(wait_min, 30.0, 45.0, 120.0, 120.0),
    }


def occupancy_membership(occ: float) -> Dict[str, float]:
    """Occupancy fuzzy sets: free, busy, full."""
    return {
        "free": _trapezoid(occ, 0.0, 0.0, 0.25, 0.45),
        "busy": _triangle(occ,  0.35, 0.55, 0.75),
        "full": _trapezoid(occ, 0.65, 0.80, 1.0, 1.0),
    }


# ────────────────────────────────────────────────────────────────────────────────
# Fuzzy Rule Engine
# ────────────────────────────────────────────────────────────────────────────────

def apply_fuzzy_rules(
    soc_m: Dict[str, float],
    dist_m: Dict[str, float],
    wait_m: Dict[str, float],
    occ_m: Dict[str, float],
    cluster_desirability: float,
    traffic: float,
) -> float:
    """
    Evaluate fuzzy rules and return a crisp desirability score.

    Rules (simplified Mamdani inference):
    R1: IF soc=critical AND dist=near  → VERY HIGH urgency
    R2: IF soc=low      AND wait=short → HIGH desirability
    R3: IF occ=full                    → LOW desirability
    R4: IF dist=far     AND soc=medium → MEDIUM desirability
    R5: cluster desirability adds bonus
    """
    scores = []
    weights = []

    # R1: Critical SoC + near station → must use it
    r1 = min(soc_m["critical"], dist_m["near"])
    scores.append(0.95); weights.append(r1 * 3.0)

    # R2: Low SoC + short wait → very desirable
    r2 = min(soc_m["low"], wait_m["short"])
    scores.append(0.85); weights.append(r2 * 2.5)

    # R3: Medium SoC + fast charger (proxied by low wait) near
    r3 = min(soc_m["medium"], wait_m["short"], dist_m["near"])
    scores.append(0.70); weights.append(r3 * 2.0)

    # R4: Full occupancy → penalty
    r4 = occ_m["full"]
    scores.append(0.05); weights.append(r4 * 2.0)

    # R5: Far + medium SoC → moderate interest
    r5 = min(dist_m["far"], soc_m["medium"])
    scores.append(0.40); weights.append(r5 * 1.0)

    # R6: High SoC → lower urgency
    r6 = soc_m["high"]
    scores.append(0.25); weights.append(r6 * 1.5)

    total_weight = sum(weights)
    if total_weight < 1e-9:
        base_score = 0.5
    else:
        base_score = sum(s * w for s, w in zip(scores, weights)) / total_weight

    # Additive adjustments
    cluster_bonus = (cluster_desirability - 0.5) * 0.15
    traffic_penalty = (traffic - 1.0) * 0.05
    final = np.clip(base_score + cluster_bonus - traffic_penalty, 0.0, 1.0)
    return float(final)


# ────────────────────────────────────────────────────────────────────────────────
# Station Ranker
# ────────────────────────────────────────────────────────────────────────────────

class FuzzyStationRanker:
    """
    Ranks candidate charging stations using fuzzy RL-inspired scoring.
    Maintains a simple Q-table (station_type → learned weight) that
    can be updated via simulated feedback.
    """

    def __init__(self):
        # Simulated learned weights per charger type
        self.q_weights: Dict[str, float] = {
            "AC_L1":   0.60,
            "AC_L2":   0.75,
            "DC_Fast": 0.88,
            "HPC":     0.95,
        }

    def score_station(
        self,
        station: Dict[str, Any],
        current_soc: float,
        distance_km: float,
        traffic_factor: float = 1.0,
    ) -> float:
        """Compute fuzzy desirability score for a single station."""
        soc_m  = soc_membership(current_soc)
        dist_m = distance_membership(distance_km)
        wait_m = wait_membership(station.get("wait_time_min", 10.0))
        occ_m  = occupancy_membership(station.get("occupancy_rate", 0.3))
        cluster_d = station.get("cluster_desirability", 0.5)

        fuzzy_score = apply_fuzzy_rules(soc_m, dist_m, wait_m, occ_m, cluster_d, traffic_factor)

        # Q-weight modulation based on charger type
        charger_type = station.get("charger_type", "AC_L2")
        q_mult = self.q_weights.get(charger_type, 0.75)
        final = fuzzy_score * 0.70 + (q_mult - 0.5) * 0.30
        return float(np.clip(final, 0.0, 1.0))

    def rank_stations(
        self,
        stations: List[Dict[str, Any]],
        current_soc: float,
        current_lat: float,
        current_lon: float,
        traffic_factor: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """Rank stations by desirability score (descending)."""
        from math import sqrt
        scored = []
        for s in stations:
            dist_km = sqrt((s["lat"] - current_lat)**2 + (s["lon"] - current_lon)**2) * 111.0
            score = self.score_station(s, current_soc, dist_km, traffic_factor)
            s_copy = dict(s)
            s_copy["fuzzy_score"] = round(score, 4)
            s_copy["distance_km"] = round(dist_km, 3)
            scored.append(s_copy)
        return sorted(scored, key=lambda x: x["fuzzy_score"], reverse=True)

    def update_q_weights(self, charger_type: str, reward: float) -> None:
        """Simulated Q-learning update (simplified)."""
        lr = 0.05
        old = self.q_weights.get(charger_type, 0.75)
        self.q_weights[charger_type] = float(np.clip(old + lr * (reward - old), 0.5, 1.0))

    def get_explanation(self, station: Dict[str, Any], soc: float, dist_km: float) -> Dict[str, Any]:
        """Return human-readable explanation of the scoring."""
        soc_m  = soc_membership(soc)
        dist_m = distance_membership(dist_km)
        return {
            "soc_state": max(soc_m, key=soc_m.get),
            "distance_state": max(dist_m, key=dist_m.get),
            "occupancy_state": "free" if station.get("occupancy_rate", 0) < 0.4 else
                               "busy" if station.get("occupancy_rate", 0) < 0.7 else "full",
            "charger_type": station.get("charger_type"),
            "cluster_desirability": station.get("cluster_desirability", 0.5),
            "q_weight": self.q_weights.get(station.get("charger_type", "AC_L2"), 0.75),
        }

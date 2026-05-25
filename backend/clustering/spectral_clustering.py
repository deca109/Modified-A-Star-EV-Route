"""
Spectral Clustering Module: Groups charging stations into geographic clusters.
Uses scikit-learn SpectralClustering on station coordinates + features.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import asdict

import numpy as np
from sklearn.cluster import SpectralClustering, KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

logger = logging.getLogger(__name__)


def compute_station_features(stations: List[Dict[str, Any]]) -> np.ndarray:
    """
    Build feature matrix for clustering.
    Features: [lat, lon, power_kw_norm, occupancy, wait_time_norm]
    """
    feats = []
    for s in stations:
        feats.append([
            s["lat"],
            s["lon"],
            s["power_kw"] / 150.0,          # normalise to HPC max
            s["occupancy_rate"],
            s["wait_time_min"] / 60.0,       # normalise to 1 hr
        ])
    return np.array(feats, dtype=np.float64)


def spectral_cluster_stations(
    stations: List[Dict[str, Any]],
    n_clusters: Optional[int] = None,
    min_clusters: int = 2,
    max_clusters: int = 6,
) -> List[Dict[str, Any]]:
    """
    Apply spectral clustering to stations.
    Returns stations annotated with cluster_id and cluster_desirability.
    """
    if len(stations) < 2:
        for s in stations:
            s["cluster_id"] = 0
            s["cluster_desirability"] = 0.5
        return stations

    feats = compute_station_features(stations)
    scaler = StandardScaler()
    X = scaler.fit_transform(feats)

    # Auto-select n_clusters if not provided
    if n_clusters is None:
        n_clusters = _select_n_clusters(X, min_clusters, max_clusters)

    n_clusters = min(n_clusters, len(stations))

    try:
        model = SpectralClustering(
            n_clusters=n_clusters,
            affinity="rbf",
            gamma=1.0,
            assign_labels="kmeans",
            random_state=42,
            n_init=10,
        )
        labels = model.fit_predict(X)
    except Exception as e:
        logger.warning(f"SpectralClustering failed ({e}), falling back to KMeans")
        model_km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = model_km.fit_predict(X)

    # Compute per-cluster desirability
    cluster_stats = _compute_cluster_desirability(stations, labels, n_clusters)

    for i, s in enumerate(stations):
        cid = int(labels[i])
        s["cluster_id"] = cid
        s["cluster_desirability"] = round(cluster_stats[cid]["desirability"], 4)

    logger.info(f"Clustered {len(stations)} stations into {n_clusters} clusters")
    return stations


def _select_n_clusters(X: np.ndarray, min_k: int, max_k: int) -> int:
    """Select best k by silhouette score."""
    best_k, best_score = min_k, -1.0
    max_k = min(max_k, len(X) - 1)
    for k in range(min_k, max_k + 1):
        try:
            km = KMeans(n_clusters=k, random_state=42, n_init=5)
            labels = km.fit_predict(X)
            score = silhouette_score(X, labels)
            if score > best_score:
                best_score = score
                best_k = k
        except Exception:
            pass
    logger.info(f"Selected n_clusters={best_k} (silhouette={best_score:.3f})")
    return best_k


def _compute_cluster_desirability(
    stations: List[Dict[str, Any]],
    labels: np.ndarray,
    n_clusters: int,
) -> Dict[int, Dict[str, Any]]:
    """
    Compute desirability score per cluster:
    - Higher power_kw → better
    - Lower occupancy  → better
    - Lower wait_time  → better
    - More stations    → better (density)
    """
    cluster_stats: Dict[int, Dict[str, Any]] = {}
    for cid in range(n_clusters):
        members = [stations[i] for i in range(len(stations)) if labels[i] == cid]
        if not members:
            cluster_stats[cid] = {"desirability": 0.0, "count": 0}
            continue
        avg_power = np.mean([m["power_kw"] for m in members]) / 150.0
        avg_occ   = np.mean([m["occupancy_rate"] for m in members])
        avg_wait  = np.mean([m["wait_time_min"] for m in members]) / 60.0
        density   = min(1.0, len(members) / 5.0)

        desirability = (
            avg_power  * 0.30 +
            (1 - avg_occ)  * 0.30 +
            (1 - avg_wait) * 0.25 +
            density        * 0.15
        )
        cluster_stats[cid] = {
            "desirability": float(np.clip(desirability, 0, 1)),
            "count": len(members),
            "avg_power_kw": float(np.mean([m["power_kw"] for m in members])),
            "avg_occupancy": float(avg_occ),
            "avg_wait_min": float(np.mean([m["wait_time_min"] for m in members])),
        }
    return cluster_stats


def get_cluster_summary(stations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return per-cluster summary stats."""
    if not stations:
        return []
    cluster_ids = sorted(set(s["cluster_id"] for s in stations))
    summaries = []
    for cid in cluster_ids:
        members = [s for s in stations if s["cluster_id"] == cid]
        summaries.append({
            "cluster_id": cid,
            "station_count": len(members),
            "desirability": members[0]["cluster_desirability"] if members else 0.0,
            "stations": [s["id"] for s in members],
            "centroid_lat": float(np.mean([s["lat"] for s in members])),
            "centroid_lon": float(np.mean([s["lon"] for s in members])),
        })
    return summaries

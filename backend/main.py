"""
FastAPI main application.

Endpoints:
  GET  /health
  GET  /graph
  GET  /charging-stations
  POST /route
  POST /simulate
  GET  /route-comparison
  GET  /battery-status
  POST /predict-maintenance
  POST /demo-scenario
  GET  /clusters
"""

import logging
import traceback
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import os
import sys

# Ensure the parent directory of 'backend' is in the Python search path to resolve 'backend' package imports
_parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)

# ── Module imports ──────────────────────────────────────────────────────────────
from backend.utils.graph_loader import get_graph, build_nx_graph_from_dict
from backend.battery.battery_simulator import BatterySimulator, DEFAULT_CAPACITY_KWH
from backend.battery.charging_stations import get_stations_from_graph
from backend.clustering.spectral_clustering import spectral_cluster_stations, get_cluster_summary
from backend.rl.fuzzy_rl import FuzzyStationRanker
from backend.routing.astar import (
    build_nx_graph,
    shortest_path_route,
    energy_aware_route,
    modified_astar_route,
    _nearest_node,
)
from backend.simulation.simulator import SimulationEngine
from backend.simulation.scenarios import DEMO_SCENARIOS, get_scenario_config
from backend.maintenance.predictor import MaintenancePredictor

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────────
# Global state (in-memory cache)
# ────────────────────────────────────────────────────────────────────────────────

_graph_data: Optional[Dict[str, Any]] = None
_nx_graph: Any = None
_stations: Optional[List[Dict[str, Any]]] = None
_clusters: Optional[List[Dict[str, Any]]] = None
_maintenance_predictor = MaintenancePredictor()
_fuzzy_ranker = FuzzyStationRanker()


def _load_resources(city: str = "Kuala Lumpur, Malaysia", use_synthetic: bool = True) -> None:
    global _graph_data, _nx_graph, _stations, _clusters
    logger.info(f"Loading graph for {city} (synthetic={use_synthetic})")
    _graph_data = get_graph(city=city, use_synthetic=use_synthetic)
    _nx_graph   = build_nx_graph(_graph_data)

    raw_stations = get_stations_from_graph(_graph_data)
    station_dicts = [s.to_dict() for s in raw_stations]
    station_dicts = spectral_cluster_stations(station_dicts)
    _stations = station_dicts
    _clusters = get_cluster_summary(_stations)
    logger.info(f"Loaded: {_graph_data['node_count']} nodes, {_graph_data['edge_count']} edges, "
                f"{len(_stations)} stations, {len(_clusters)} clusters")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_resources(use_synthetic=True)
    yield


# ────────────────────────────────────────────────────────────────────────────────
# FastAPI app
# ────────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EV Route Optimizer API",
    description="Modified A* EV Routing + Battery Health + Predictive Maintenance",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ────────────────────────────────────────────────────────────────────────────────
# Pydantic request/response models
# ────────────────────────────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    source_node: Optional[Any] = None
    target_node: Optional[Any] = None
    source_lat: Optional[float] = None
    source_lon: Optional[float] = None
    target_lat: Optional[float] = None
    target_lon: Optional[float] = None
    initial_soc: float = Field(default=0.85, ge=0.0, le=1.0)
    initial_soh: float = Field(default=0.95, ge=0.0, le=1.0)
    capacity_kwh: float = Field(default=DEFAULT_CAPACITY_KWH, gt=0)
    algorithm: str = Field(default="all", description="shortest | energy | modified | all")


class SimulateRequest(BaseModel):
    source_node: Optional[Any] = None
    target_node: Optional[Any] = None
    source_lat: Optional[float] = None
    source_lon: Optional[float] = None
    target_lat: Optional[float] = None
    target_lon: Optional[float] = None
    initial_soc: float = Field(default=0.85, ge=0.0, le=1.0)
    initial_soh: float = Field(default=0.95, ge=0.0, le=1.0)
    capacity_kwh: float = Field(default=DEFAULT_CAPACITY_KWH, gt=0)
    algorithm: str = Field(default="modified")


class MaintenanceRequest(BaseModel):
    soh: float = Field(default=0.90, ge=0.0, le=1.0)
    soc: float = Field(default=0.70, ge=0.0, le=1.0)
    cycle_count: float = Field(default=150.0, ge=0)
    deep_discharge_count: int = Field(default=2, ge=0)
    stress_score: float = Field(default=0.3, ge=0.0, le=1.0)
    total_energy_discharged_kwh: float = Field(default=5000.0, ge=0)
    charging_events_count: int = Field(default=200, ge=0)


class DemoScenarioRequest(BaseModel):
    scenario_id: str


class ReloadRequest(BaseModel):
    city: str = "Kuala Lumpur, Malaysia"
    use_synthetic: bool = True


# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

def _resolve_nodes(req_source, req_target, src_lat, src_lon, tgt_lat, tgt_lon):
    if _nx_graph is None:
        raise HTTPException(503, "Graph not loaded")
    nodes = list(_nx_graph.nodes())
    if req_source is not None and req_source in _nx_graph:
        source = req_source
    elif src_lat is not None and src_lon is not None:
        source = _nearest_node(_nx_graph, src_lat, src_lon)
    else:
        source = nodes[0]
    if req_target is not None and req_target in _nx_graph:
        target = req_target
    elif tgt_lat is not None and tgt_lon is not None:
        target = _nearest_node(_nx_graph, tgt_lat, tgt_lon)
    else:
        target = nodes[-1]
    return source, target


# ────────────────────────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "graph_loaded": _graph_data is not None,
        "nodes": _graph_data["node_count"] if _graph_data else 0,
        "edges": _graph_data["edge_count"] if _graph_data else 0,
        "stations": len(_stations) if _stations else 0,
        "clusters": len(_clusters) if _clusters else 0,
    }


@app.get("/graph")
async def get_graph_endpoint(max_nodes: int = Query(default=200, le=500)):
    if _graph_data is None:
        raise HTTPException(503, "Graph not loaded")
    nodes = _graph_data["nodes"][:max_nodes]
    node_ids = {n["id"] for n in nodes}
    edges = [e for e in _graph_data["edges"] if e["source"] in node_ids and e["target"] in node_ids]
    return {"nodes": nodes, "edges": edges, "node_count": len(nodes), "edge_count": len(edges)}


@app.get("/charging-stations")
async def get_charging_stations():
    if _stations is None:
        raise HTTPException(503, "Stations not loaded")
    return {"stations": _stations, "count": len(_stations)}


@app.get("/clusters")
async def get_clusters():
    if _clusters is None:
        raise HTTPException(503, "Clusters not computed")
    return {"clusters": _clusters, "count": len(_clusters)}


@app.post("/route")
async def compute_route(req: RouteRequest):
    try:
        source, target = _resolve_nodes(
            req.source_node, req.target_node,
            req.source_lat, req.source_lon,
            req.target_lat, req.target_lon,
        )
        station_list = _stations or []
        results = {}

        if req.algorithm in ("shortest", "all"):
            r = shortest_path_route(_nx_graph, source, target, req.initial_soc, req.initial_soh, req.capacity_kwh)
            results["shortest"] = _route_to_dict(r)

        if req.algorithm in ("energy", "all"):
            r = energy_aware_route(_nx_graph, source, target, req.initial_soc, req.initial_soh, req.capacity_kwh)
            results["energy"] = _route_to_dict(r)

        if req.algorithm in ("modified", "all"):
            r = modified_astar_route(_nx_graph, source, target, station_list, req.initial_soc, req.initial_soh, req.capacity_kwh)
            results["modified"] = _route_to_dict(r)

        return {"routes": results, "source": source, "target": target}
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))


@app.post("/simulate")
async def run_simulation(req: SimulateRequest):
    try:
        source, target = _resolve_nodes(
            req.source_node, req.target_node,
            req.source_lat, req.source_lon,
            req.target_lat, req.target_lon,
        )
        station_list = _stations or []

        # Compute route first
        if req.algorithm == "shortest":
            route = shortest_path_route(_nx_graph, source, target, req.initial_soc, req.initial_soh, req.capacity_kwh)
        elif req.algorithm == "energy":
            route = energy_aware_route(_nx_graph, source, target, req.initial_soc, req.initial_soh, req.capacity_kwh)
        else:
            route = modified_astar_route(_nx_graph, source, target, station_list, req.initial_soc, req.initial_soh, req.capacity_kwh)

        # Run simulation
        sim = SimulationEngine(req.capacity_kwh, req.initial_soc, req.initial_soh)
        result = sim.run(route, _graph_data, station_list)

        # Maintenance prediction
        battery_summary = sim.battery.get_summary()
        maint = _maintenance_predictor.predict(
            soh=battery_summary["soh"],
            soc=battery_summary["soc"],
            cycle_count=battery_summary["cycle_count"],
            deep_discharge_count=battery_summary["deep_discharge_count"],
            stress_score=battery_summary["stress_score"],
            total_energy_discharged_kwh=battery_summary["total_energy_discharged_kwh"],
            charging_events_count=len(battery_summary["charging_events"]),
        )

        return {
            "simulation": result.to_dict(),
            "battery_summary": battery_summary,
            "maintenance": maint.to_dict(),
            "route_summary": _route_to_dict(route),
        }
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))


@app.get("/route-comparison")
async def route_comparison(
    source_node: Optional[str] = None,
    target_node: Optional[str] = None,
    initial_soc: float = Query(default=0.85),
    initial_soh: float = Query(default=0.95),
):
    try:
        source, target = _resolve_nodes(source_node, target_node, None, None, None, None)
        station_list = _stations or []
        capacity = DEFAULT_CAPACITY_KWH

        sp = shortest_path_route(_nx_graph, source, target, initial_soc, initial_soh, capacity)
        ea = energy_aware_route(_nx_graph, source, target, initial_soc, initial_soh, capacity)
        ma = modified_astar_route(_nx_graph, source, target, station_list, initial_soc, initial_soh, capacity)

        return {
            "comparison": [
                _comparison_row(sp),
                _comparison_row(ea),
                _comparison_row(ma),
            ],
            "source": source,
            "target": target,
        }
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))


@app.get("/battery-status")
async def battery_status(
    soc: float = Query(default=0.85),
    soh: float = Query(default=0.95),
    capacity_kwh: float = Query(default=DEFAULT_CAPACITY_KWH),
):
    sim = BatterySimulator(capacity_kwh=capacity_kwh, initial_soc=soc, initial_soh=soh)
    return sim.get_summary()


@app.post("/predict-maintenance")
async def predict_maintenance(req: MaintenanceRequest):
    try:
        result = _maintenance_predictor.predict(
            soh=req.soh,
            soc=req.soc,
            cycle_count=req.cycle_count,
            deep_discharge_count=req.deep_discharge_count,
            stress_score=req.stress_score,
            total_energy_discharged_kwh=req.total_energy_discharged_kwh,
            charging_events_count=req.charging_events_count,
        )
        return result.to_dict()
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/demo-scenario")
async def run_demo_scenario(req: DemoScenarioRequest):
    try:
        scenario = get_scenario_config(req.scenario_id)
        cfg = scenario["config"]
        nodes = list(_nx_graph.nodes())
        station_list = _stations or []

        src_idx = cfg.get("source_index", 0)
        tgt_idx = cfg.get("target_index", -1)
        source = nodes[src_idx % len(nodes)]
        target = nodes[tgt_idx % len(nodes)]

        soc = cfg.get("initial_soc", 0.85)
        soh = cfg.get("initial_soh", 0.95)

        # Apply scenario modifiers
        if cfg.get("congested_station"):
            for s in station_list[:2]:
                s["occupancy_rate"] = 0.95
                s["wait_time_min"] = 45.0

        if cfg.get("traffic_scenario") == "heavy":
            # In a real impl we'd modify edge weights
            pass

        # Run all three algorithms for comparison
        sp  = shortest_path_route(_nx_graph, source, target, soc, soh)
        ea  = energy_aware_route(_nx_graph, source, target, soc, soh)
        ma  = modified_astar_route(_nx_graph, source, target, station_list, soc, soh)

        sim = SimulationEngine(DEFAULT_CAPACITY_KWH, soc, soh)
        sim_result = sim.run(ma, _graph_data, station_list)

        battery_summary = sim.battery.get_summary()
        if cfg.get("force_maintenance_alert"):
            battery_summary["soh"] = soh
            battery_summary["deep_discharge_count"] = 15

        maint = _maintenance_predictor.predict(
            soh=battery_summary["soh"],
            soc=battery_summary["soc"],
            cycle_count=battery_summary.get("cycle_count", 200),
            deep_discharge_count=battery_summary.get("deep_discharge_count", 0),
            stress_score=battery_summary.get("stress_score", 0.3),
            total_energy_discharged_kwh=battery_summary.get("total_energy_discharged_kwh", 0),
            charging_events_count=len(battery_summary.get("charging_events", [])),
        )

        return {
            "scenario": scenario,
            "comparison": [_comparison_row(sp), _comparison_row(ea), _comparison_row(ma)],
            "simulation": sim_result.to_dict(),
            "maintenance": maint.to_dict(),
            "battery_summary": battery_summary,
            "route_coords": {
                "shortest": _route_to_dict(sp),
                "energy": _route_to_dict(ea),
                "modified": _route_to_dict(ma),
            },
        }
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))


@app.get("/demo-scenarios")
async def list_demo_scenarios():
    return {"scenarios": DEMO_SCENARIOS}


@app.post("/reload")
async def reload_graph(req: ReloadRequest):
    try:
        _load_resources(city=req.city, use_synthetic=req.use_synthetic)
        return {"status": "ok", "message": f"Graph reloaded for {req.city}"}
    except Exception as e:
        raise HTTPException(500, str(e))


# ────────────────────────────────────────────────────────────────────────────────
# Serialisation helpers
# ────────────────────────────────────────────────────────────────────────────────

def _route_to_dict(r) -> Dict[str, Any]:
    from dataclasses import asdict
    d = asdict(r)
    # Convert tuple coords to lists for JSON
    d["path_coords"] = [list(c) for c in r.path_coords]
    return d


def _comparison_row(r) -> Dict[str, Any]:
    return {
        "algorithm": r.algorithm,
        "distance_km": r.total_distance_km,
        "energy_kwh": r.total_energy_kwh,
        "time_min": r.total_time_min,
        "charging_stops": len(r.charging_stops),
        "soc_final": r.soc_final,
        "soh_final": r.soh_final,
        "soh_impact": round(r.soh_initial - r.soh_final, 5),
        "feasible": r.feasible,
        "feasibility_score": r.feasibility_score,
        "battery_violations": r.battery_violations,
        "runtime_ms": r.runtime_ms,
        "path_length": len(r.path),
    }

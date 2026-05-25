import sys
sys.path.insert(0, '.')
from utils.graph_loader import generate_synthetic_graph, graph_to_dict
from battery.battery_simulator import BatterySimulator
from battery.charging_stations import generate_synthetic_stations
from clustering.spectral_clustering import spectral_cluster_stations
from rl.fuzzy_rl import FuzzyStationRanker
from routing.astar import build_nx_graph, modified_astar_route, shortest_path_route, energy_aware_route
from maintenance.predictor import MaintenancePredictor

print("=== EV Route Optimizer - Smoke Test ===")

# Graph
G_nx = generate_synthetic_graph(50)
g = graph_to_dict(G_nx)
print(f"Graph: {g['node_count']} nodes, {g['edge_count']} edges")

# Stations
stations = generate_synthetic_stations(g['nodes'], n_stations=10)
station_dicts = [s.to_dict() for s in stations]
station_dicts = spectral_cluster_stations(station_dicts, n_clusters=3)
print(f"Stations: {len(station_dicts)}, clusters: {len(set(s['cluster_id'] for s in station_dicts))}")

# Routing
nx_G = build_nx_graph(g)
nodes = list(nx_G.nodes())
src, tgt = nodes[0], nodes[-1]

r_sp = shortest_path_route(nx_G, src, tgt)
r_ea = energy_aware_route(nx_G, src, tgt)
r_ma = modified_astar_route(nx_G, src, tgt, station_dicts)

print(f"Shortest: {r_sp.total_distance_km:.2f}km, feasible={r_sp.feasible}")
print(f"Energy:   {r_ea.total_energy_kwh:.3f}kWh, feasible={r_ea.feasible}")
print(f"Modified: {r_ma.total_energy_kwh:.3f}kWh, stops={len(r_ma.charging_stops)}, feasible={r_ma.feasible}")

# Maintenance
mp = MaintenancePredictor()
pred = mp.predict(soh=0.88, soc=0.75, cycle_count=200, deep_discharge_count=3,
                  stress_score=0.25, total_energy_discharged_kwh=5000, charging_events_count=150)
print(f"Maintenance: risk={pred.health_risk_level}, RUL={pred.rul_cycles:.0f} cycles")

# Fuzzy RL
ranker = FuzzyStationRanker()
ranked = ranker.rank_stations(station_dicts, current_soc=0.3, current_lat=3.14, current_lon=101.69)
print(f"Top station: {ranked[0]['name']} (score={ranked[0]['fuzzy_score']:.3f})")

print("\n=== ALL TESTS PASSED ===")

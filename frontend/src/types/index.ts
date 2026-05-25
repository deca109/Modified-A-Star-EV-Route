// TypeScript type definitions for the EV Routing Platform

export interface GraphNode {
  id: number | string;
  lat: number;
  lon: number;
  slope: number;
  is_charging_station: boolean;
  name: string;
  node_type: 'intersection' | 'charging_station';
}

export interface GraphEdge {
  source: number | string;
  target: number | string;
  distance: number;
  slope: number;
  speed_kmh: number;
  traffic_factor: number;
  energy_cost: number;
  travel_time: number;
  road_type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

export interface ChargingStation {
  id: string;
  node_id: number | string;
  name: string;
  lat: number;
  lon: number;
  charger_type: 'AC_L1' | 'AC_L2' | 'DC_Fast' | 'HPC';
  power_kw: number;
  num_connectors: number;
  occupancy_rate: number;
  wait_time_min: number;
  price_per_kwh: number;
  cluster_id: number;
  desirability_score: number;
  operator: string;
  fuzzy_score?: number;
  distance_km?: number;
}

export interface ClusterSummary {
  cluster_id: number;
  station_count: number;
  desirability: number;
  stations: string[];
  centroid_lat: number;
  centroid_lon: number;
}

export interface RouteResult {
  algorithm: string;
  path: (number | string)[];
  path_coords: [number, number][];
  total_distance_km: number;
  total_energy_kwh: number;
  total_time_min: number;
  charging_stops: ChargingStop[];
  feasible: boolean;
  soc_final: number;
  soh_final: number;
  soc_initial: number;
  soh_initial: number;
  battery_violations: number;
  runtime_ms: number;
  cost: number;
  feasibility_score: number;
  path_details: PathDetail[];
}

export interface ChargingStop {
  node_id: number | string;
  station_id: string;
  station_name: string;
  charger_type: string;
  wait_time_min: number;
  soc_before: number;
  soc_after: number;
}

export interface PathDetail {
  from: number | string;
  to: number | string;
  distance_m: number;
  energy_kwh: number;
  time_min: number;
  soc_after: number;
}

export interface SimulationStep {
  step: number;
  node_id: number | string;
  lat: number;
  lon: number;
  soc: number;
  soh: number;
  speed_kmh: number;
  energy_consumed_kwh: number;
  cumulative_distance_km: number;
  cumulative_time_min: number;
  cumulative_energy_kwh: number;
  stress_score: number;
  event: 'travel' | 'charging' | 'idle' | 'arrived';
  event_detail: string;
}

export interface SimulationResult {
  route_algorithm: string;
  steps: SimulationStep[];
  total_distance_km: number;
  total_time_min: number;
  total_energy_kwh: number;
  charging_stops: ChargingEventRecord[];
  final_soc: number;
  final_soh: number;
  initial_soc: number;
  initial_soh: number;
  battery_violations: number;
  maintenance_alerts: string[];
  feasible: boolean;
}

export interface ChargingEventRecord {
  station_id: string;
  station_name: string;
  soc_before: number;
  soc_after: number;
  energy_added_kwh: number;
  charging_time_min: number;
  wait_time_min: number;
  charger_type: string;
}

export interface MaintenancePrediction {
  battery_stress_score: number;
  health_risk_level: 'Low' | 'Moderate' | 'High' | 'Critical';
  rul_cycles: number;
  rul_km_estimate: number;
  warnings: string[];
  recommendations: string[];
  confidence: number;
  details: {
    soh: number;
    soc: number;
    cycle_count: number;
    deep_discharge_count: number;
    total_energy_discharged_kwh: number;
    charging_events: number;
    design_life_cycles: number;
    pct_life_used: number;
    model_type: string;
  };
}

export interface ComparisonRow {
  algorithm: string;
  distance_km: number;
  energy_kwh: number;
  time_min: number;
  charging_stops: number;
  soc_final: number;
  soh_final: number;
  soh_impact: number;
  feasible: boolean;
  feasibility_score: number;
  battery_violations: number;
  runtime_ms: number;
  path_length: number;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: Record<string, unknown>;
}

export interface BatteryStatus {
  soc: number;
  soh: number;
  capacity_kwh: number;
  usable_energy_kwh: number;
  cycle_count: number;
  total_energy_discharged_kwh: number;
  total_energy_charged_kwh: number;
  deep_discharge_count: number;
  stress_score: number;
  charging_events: ChargingEventRecord[];
  snapshots: SimulationStep[];
}

export type Algorithm = 'shortest' | 'energy' | 'modified';

export interface RouteRequest {
  source_node?: number | string;
  target_node?: number | string;
  source_lat?: number;
  source_lon?: number;
  target_lat?: number;
  target_lon?: number;
  initial_soc?: number;
  initial_soh?: number;
  capacity_kwh?: number;
  algorithm?: 'shortest' | 'energy' | 'modified' | 'all';
}

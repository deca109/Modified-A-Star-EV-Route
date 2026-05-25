// API service: all HTTP calls to the FastAPI backend

import axios from 'axios';
import type {
  GraphData,
  ChargingStation,
  ClusterSummary,
  RouteResult,
  SimulationResult,
  MaintenancePrediction,
  ComparisonRow,
  DemoScenario,
  BatteryStatus,
  RouteRequest,
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Health ──────────────────────────────────────────────────────────────────────

export async function checkHealth() {
  const res = await api.get('/health');
  return res.data;
}

// ── Graph ───────────────────────────────────────────────────────────────────────

export async function fetchGraph(maxNodes = 200): Promise<GraphData> {
  const res = await api.get('/graph', { params: { max_nodes: maxNodes } });
  return res.data;
}

// ── Charging Stations ────────────────────────────────────────────────────────────

export async function fetchChargingStations(): Promise<{ stations: ChargingStation[]; count: number }> {
  const res = await api.get('/charging-stations');
  return res.data;
}

// ── Clusters ─────────────────────────────────────────────────────────────────────

export async function fetchClusters(): Promise<{ clusters: ClusterSummary[]; count: number }> {
  const res = await api.get('/clusters');
  return res.data;
}

// ── Route Planning ───────────────────────────────────────────────────────────────

export async function planRoute(request: RouteRequest): Promise<{
  routes: { shortest?: RouteResult; energy?: RouteResult; modified?: RouteResult };
  source: number | string;
  target: number | string;
}> {
  const res = await api.post('/route', request);
  return res.data;
}

// ── Simulation ───────────────────────────────────────────────────────────────────

export async function runSimulation(request: RouteRequest & { algorithm?: string }): Promise<{
  simulation: SimulationResult;
  battery_summary: BatteryStatus;
  maintenance: MaintenancePrediction;
  route_summary: RouteResult;
}> {
  const res = await api.post('/simulate', request);
  return res.data;
}

// ── Route Comparison ─────────────────────────────────────────────────────────────

export async function fetchRouteComparison(params?: {
  source_node?: string;
  target_node?: string;
  initial_soc?: number;
  initial_soh?: number;
}): Promise<{ comparison: ComparisonRow[]; source: unknown; target: unknown }> {
  const res = await api.get('/route-comparison', { params });
  return res.data;
}

// ── Battery Status ───────────────────────────────────────────────────────────────

export async function fetchBatteryStatus(params?: {
  soc?: number;
  soh?: number;
  capacity_kwh?: number;
}): Promise<BatteryStatus> {
  const res = await api.get('/battery-status', { params });
  return res.data;
}

// ── Predictive Maintenance ───────────────────────────────────────────────────────

export async function predictMaintenance(data: {
  soh: number;
  soc: number;
  cycle_count: number;
  deep_discharge_count: number;
  stress_score: number;
  total_energy_discharged_kwh: number;
  charging_events_count: number;
}): Promise<MaintenancePrediction> {
  const res = await api.post('/predict-maintenance', data);
  return res.data;
}

// ── Demo Scenarios ───────────────────────────────────────────────────────────────

export async function fetchDemoScenarios(): Promise<{ scenarios: DemoScenario[] }> {
  const res = await api.get('/demo-scenarios');
  return res.data;
}

export async function runDemoScenario(scenarioId: string): Promise<{
  scenario: DemoScenario;
  comparison: ComparisonRow[];
  simulation: SimulationResult;
  maintenance: MaintenancePrediction;
  battery_summary: BatteryStatus;
  route_coords: { shortest: RouteResult; energy: RouteResult; modified: RouteResult };
}> {
  const res = await api.post('/demo-scenario', { scenario_id: scenarioId });
  return res.data;
}

// ── Reload Graph ──────────────────────────────────────────────────────────────────

export async function reloadGraph(city = 'Kuala Lumpur, Malaysia', useSynthetic = true) {
  const res = await api.post('/reload', { city, use_synthetic: useSynthetic });
  return res.data;
}

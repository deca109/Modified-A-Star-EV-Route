// Zustand store: global state management for the EV dashboard

import { create } from 'zustand';
import type {
  GraphData,
  ChargingStation,
  ClusterSummary,
  RouteResult,
  SimulationResult,
  SimulationStep,
  MaintenancePrediction,
  ComparisonRow,
  DemoScenario,
  BatteryStatus,
} from '@/types';

export type ActivePanel = 'map' | 'battery' | 'comparison' | 'maintenance' | 'analytics';
export type ActiveAlgorithm = 'shortest' | 'energy' | 'modified';

interface EVStore {
  // ── Connection ──────────────────────────────────────────────────────────────
  backendOnline: boolean;
  setBackendOnline: (v: boolean) => void;

  // ── Graph & Map ─────────────────────────────────────────────────────────────
  graphData: GraphData | null;
  stations: ChargingStation[];
  clusters: ClusterSummary[];
  setGraphData: (g: GraphData) => void;
  setStations: (s: ChargingStation[]) => void;
  setClusters: (c: ClusterSummary[]) => void;

  // ── Route selection ──────────────────────────────────────────────────────────
  sourceNode: number | string | null;
  targetNode: number | string | null;
  setSourceNode: (n: number | string | null) => void;
  setTargetNode: (n: number | string | null) => void;

  // ── Battery config ───────────────────────────────────────────────────────────
  initialSoc: number;
  initialSoh: number;
  capacityKwh: number;
  setInitialSoc: (v: number) => void;
  setInitialSoh: (v: number) => void;
  setCapacityKwh: (v: number) => void;

  // ── Route results ─────────────────────────────────────────────────────────────
  routes: { shortest?: RouteResult; energy?: RouteResult; modified?: RouteResult } | null;
  activeAlgorithm: ActiveAlgorithm;
  setRoutes: (r: { shortest?: RouteResult; energy?: RouteResult; modified?: RouteResult }) => void;
  setActiveAlgorithm: (a: ActiveAlgorithm) => void;

  // ── Simulation ────────────────────────────────────────────────────────────────
  simulation: SimulationResult | null;
  simulationStep: number;
  isSimulating: boolean;
  simulationSpeed: number;
  setSimulation: (s: SimulationResult | null) => void;
  setSimulationStep: (n: number) => void;
  setIsSimulating: (v: boolean) => void;
  setSimulationSpeed: (v: number) => void;

  // ── Battery ───────────────────────────────────────────────────────────────────
  batteryStatus: BatteryStatus | null;
  setBatteryStatus: (b: BatteryStatus | null) => void;

  // ── Maintenance ───────────────────────────────────────────────────────────────
  maintenance: MaintenancePrediction | null;
  setMaintenance: (m: MaintenancePrediction | null) => void;

  // ── Comparison ────────────────────────────────────────────────────────────────
  comparison: ComparisonRow[];
  setComparison: (c: ComparisonRow[]) => void;

  // ── Demo scenarios ────────────────────────────────────────────────────────────
  demoScenarios: DemoScenario[];
  activeScenario: DemoScenario | null;
  setDemoScenarios: (s: DemoScenario[]) => void;
  setActiveScenario: (s: DemoScenario | null) => void;

  // ── UI State ──────────────────────────────────────────────────────────────────
  activePanel: ActivePanel;
  setActivePanel: (p: ActivePanel) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (m: string) => void;
  error: string | null;
  setError: (e: string | null) => void;
  showClusters: boolean;
  setShowClusters: (v: boolean) => void;
  showStations: boolean;
  setShowStations: (v: boolean) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (v: boolean) => void;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (v: boolean) => void;
}

export const useEVStore = create<EVStore>((set, get) => ({
  // ── Connection ──────────────────────────────────────────────────────────────
  backendOnline: false,
  setBackendOnline: (v) => set({ backendOnline: v }),

  // ── Graph & Map ─────────────────────────────────────────────────────────────
  graphData: null,
  stations: [],
  clusters: [],
  setGraphData: (g) => set({ graphData: g }),
  setStations: (s) => set({ stations: s }),
  setClusters: (c) => set({ clusters: c }),

  // ── Route selection ──────────────────────────────────────────────────────────
  sourceNode: null,
  targetNode: null,
  setSourceNode: (n) => set({ sourceNode: n }),
  setTargetNode: (n) => set({ targetNode: n }),

  // ── Battery config ───────────────────────────────────────────────────────────
  initialSoc: 0.85,
  initialSoh: 0.95,
  capacityKwh: 75.0,
  setInitialSoc: (v) => set({ initialSoc: v }),
  setInitialSoh: (v) => set({ initialSoh: v }),
  setCapacityKwh: (v) => set({ capacityKwh: v }),

  // ── Route results ─────────────────────────────────────────────────────────────
  routes: null,
  activeAlgorithm: 'modified',
  setRoutes: (r) => set({ routes: r }),
  setActiveAlgorithm: (a) => set({ activeAlgorithm: a }),

  // ── Simulation ────────────────────────────────────────────────────────────────
  simulation: null,
  simulationStep: 0,
  isSimulating: false,
  simulationSpeed: 300, // ms per step
  setSimulation: (s) => set({ simulation: s, simulationStep: 0 }),
  setSimulationStep: (n) => set({ simulationStep: n }),
  setIsSimulating: (v) => set({ isSimulating: v }),
  setSimulationSpeed: (v) => set({ simulationSpeed: v }),

  // ── Battery ───────────────────────────────────────────────────────────────────
  batteryStatus: null,
  setBatteryStatus: (b) => set({ batteryStatus: b }),

  // ── Maintenance ───────────────────────────────────────────────────────────────
  maintenance: null,
  setMaintenance: (m) => set({ maintenance: m }),

  // ── Comparison ────────────────────────────────────────────────────────────────
  comparison: [],
  setComparison: (c) => set({ comparison: c }),

  // ── Demo scenarios ────────────────────────────────────────────────────────────
  demoScenarios: [
    {
      id: 'short_fail',
      name: 'Short Route Without Battery-Aware Planning',
      description: 'A short route that fails with naive routing but succeeds with Modified A*',
      icon: '⚡',
      config: {},
    },
    {
      id: 'congested_station',
      name: 'Congested Charging Station Reroute',
      description: 'Primary charging station is full; Modified A* reroutes to the next best cluster',
      icon: '🚧',
      config: {},
    },
    {
      id: 'low_soh',
      name: 'Degraded Battery Scenario',
      description: 'Battery is at 70% SoH. Modified A* routes conservatively to preserve health.',
      icon: '🔋',
      config: {},
    },
    {
      id: 'heavy_traffic',
      name: 'Heavy Traffic Rerouting',
      description: 'High traffic multipliers force energy-inefficient routes; Modified A* adapts.',
      icon: '🚗',
      config: {},
    },
    {
      id: 'maintenance_warning',
      name: 'Maintenance Warning Scenario',
      description: 'Old battery with many deep discharge cycles triggers critical maintenance alerts.',
      icon: '🔧',
      config: {},
    },
    {
      id: 'impossible_route',
      name: 'Impossible Range / Out of Charge',
      description: 'Starting SoC is extremely low (0.1%). The destination is unreachable even with intermediate charging. Shortest path still displays on the map but shows as Infeasible.',
      icon: '🚨',
      config: {},
    },
  ],
  activeScenario: null,
  setDemoScenarios: (s) => set({ demoScenarios: s }),
  setActiveScenario: (s) => set({ activeScenario: s }),

  // ── UI State ──────────────────────────────────────────────────────────────────
  activePanel: 'map',
  setActivePanel: (p) => set({ activePanel: p }),
  isLoading: false,
  setIsLoading: (v) => set({ isLoading: v }),
  loadingMessage: '',
  setLoadingMessage: (m) => set({ loadingMessage: m }),
  error: null,
  setError: (e) => set({ error: e }),
  showClusters: true,
  setShowClusters: (v) => set({ showClusters: v }),
  showStations: true,
  setShowStations: (v) => set({ showStations: v }),
  leftSidebarOpen: false,
  setLeftSidebarOpen: (v) => set({ leftSidebarOpen: v }),
  rightSidebarOpen: false,
  setRightSidebarOpen: (v) => set({ rightSidebarOpen: v }),
}));

'use client';

import { motion } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { Battery, Activity, MapPin, Layers, Eye, EyeOff, RotateCcw } from 'lucide-react';

export default function Sidebar() {
  const {
    simulation,
    showClusters, setShowClusters,
    showStations, setShowStations,
    clusters,
    stations,
    isSimulating,
    simulationStep,
    setSimulationStep,
    setIsSimulating,
    simulationSpeed,
    setSimulationSpeed,
  } = useEVStore();

  const currentStep = simulation?.steps[simulationStep];

  return (
    <aside
      className="flex flex-col gap-4 overflow-y-auto p-4 border-r h-full scrollbar-none"
      style={{
        width: '240px',
        flexShrink: 0,
        borderColor: '#1e293b',
        background: 'rgba(11, 18, 32, 0.85)',
      }}
    >
      {/* Live Battery Gauges */}
      <div className="glass-card-sm p-3">
        <p className="section-header">Live Battery</p>
        <div className="flex flex-col gap-3">
          <BatteryGauge
            label="SoC"
            value={currentStep?.soc ?? simulation?.initial_soc ?? 0.85}
            colorClass="from-green-400 to-emerald-600"
          />
          <BatteryGauge
            label="SoH"
            value={currentStep?.soh ?? simulation?.initial_soh ?? 0.95}
            colorClass="from-blue-400 to-indigo-600"
          />
          <BatteryGauge
            label="Stress"
            value={currentStep?.stress_score ?? 0}
            colorClass="from-amber-400 to-red-500"
            invert
          />
        </div>
      </div>

      {/* Simulation Controls */}
      {simulation && (
        <div className="glass-card-sm p-3">
          <p className="section-header">Simulation</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                className={`btn-primary flex-1 text-xs py-1.5 ${isSimulating ? 'btn-danger' : ''}`}
                onClick={() => setIsSimulating(!isSimulating)}
              >
                {isSimulating ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                className="btn-secondary px-2 py-1.5"
                onClick={() => { setSimulationStep(0); setIsSimulating(false); }}
                title="Reset"
              >
                <RotateCcw size={12} />
              </button>
            </div>
            {/* Step slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Step {simulationStep + 1}</span>
                <span>/ {simulation.steps.length}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, simulation.steps.length - 1)}
                value={simulationStep}
                onChange={(e) => { setIsSimulating(false); setSimulationStep(Number(e.target.value)); }}
                className="w-full accent-indigo-500"
              />
            </div>
            {/* Speed */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Speed</span>
                <span>{simulationSpeed}ms</span>
              </div>
              <input
                type="range" min={50} max={1000} step={50}
                value={simulationSpeed}
                onChange={(e) => setSimulationSpeed(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Current Step Info */}
      {currentStep && (
        <div className="glass-card-sm p-3">
          <p className="section-header">Current Step</p>
          <div className="flex flex-col gap-1.5 text-xs">
            <Row label="Event" value={currentStep.event} colored />
            <Row label="Speed" value={`${currentStep.speed_kmh.toFixed(0)} km/h`} />
            <Row label="Energy" value={`${currentStep.energy_consumed_kwh.toFixed(3)} kWh`} />
            <Row label="Distance" value={`${currentStep.cumulative_distance_km.toFixed(2)} km`} />
            <Row label="Time" value={`${currentStep.cumulative_time_min.toFixed(1)} min`} />
          </div>
        </div>
      )}

      {/* Layer Controls */}
      <div className="glass-card-sm p-3">
        <p className="section-header">Map Layers</p>
        <div className="flex flex-col gap-2">
          <LayerToggle
            label={`Stations (${stations.length})`}
            active={showStations}
            onToggle={() => setShowStations(!showStations)}
            icon={<MapPin size={11} />}
          />
          <LayerToggle
            label={`Clusters (${clusters.length})`}
            active={showClusters}
            onToggle={() => setShowClusters(!showClusters)}
            icon={<Layers size={11} />}
          />
        </div>
      </div>

      {/* Cluster summary */}
      {clusters.length > 0 && showClusters && (
        <div className="glass-card-sm p-3">
          <p className="section-header">Clusters</p>
          <div className="flex flex-col gap-1.5">
            {clusters.map((c) => (
              <div key={c.cluster_id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: CLUSTER_COLORS[c.cluster_id % CLUSTER_COLORS.length] }}
                  />
                  <span className="text-slate-300">Cluster {c.cluster_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{c.station_count} stn</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: desirabilityColor(c.desirability) }}
                  >
                    {(c.desirability * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function BatteryGauge({
  label, value, colorClass, invert = false,
}: { label: string; value: number; colorClass: string; invert?: boolean }) {
  const pct = Math.round(value * 100);
  const displayPct = invert ? 100 - pct : pct;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold font-mono" style={{ color: invert && pct > 60 ? '#f87171' : '#f1f5f9' }}>
          {pct}%
        </span>
      </div>
      <div className="progress-track">
        <motion.div
          className={`progress-fill bg-gradient-to-r ${colorClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function Row({ label, value, colored }: { label: string; value: string; colored?: boolean }) {
  const eventColors: Record<string, string> = {
    travel: '#38bdf8', charging: '#34d399', idle: '#94a3b8', arrived: '#818cf8',
  };
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span
        className="font-medium"
        style={{ color: colored ? (eventColors[value] ?? '#f1f5f9') : '#f1f5f9' }}
      >
        {value}
      </span>
    </div>
  );
}

function LayerToggle({ label, active, onToggle, icon }: {
  label: string; active: boolean; onToggle: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center justify-between w-full text-xs py-1.5 px-2 rounded-lg transition-all"
      style={{
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: active ? '#818cf8' : '#64748b',
        border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
      }}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">{icon}<span>{label}</span></div>
      {active ? <Eye size={11} /> : <EyeOff size={11} />}
    </button>
  );
}

export const CLUSTER_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c',
];

function desirabilityColor(d: number): string {
  if (d > 0.7) return '#34d399';
  if (d > 0.4) return '#fbbf24';
  return '#f87171';
}

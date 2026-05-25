'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { planRoute, runSimulation } from '@/services/api';
import { Navigation, Zap, GitBranch, PlayCircle } from 'lucide-react';

const ALGORITHMS = [
  { id: 'shortest', label: 'Shortest Path',  color: '#38bdf8' },
  { id: 'energy',   label: 'Energy-Aware',   color: '#34d399' },
  { id: 'modified', label: 'Modified A*',    color: '#818cf8' },
] as const;

export default function RouteControls() {
  const {
    graphData,
    stations,
    sourceNode, setSourceNode,
    targetNode, setTargetNode,
    initialSoc, setInitialSoc,
    initialSoh, setInitialSoh,
    setRoutes,
    setSimulation,
    setComparison,
    setMaintenance,
    setBatteryStatus,
    activeAlgorithm, setActiveAlgorithm,
    setIsLoading, setLoadingMessage, setError,
    isLoading,
  } = useEVStore();

  const nodes = graphData?.nodes ?? [];

  const handlePlan = async () => {
    if (!graphData) return;
    setIsLoading(true);
    setLoadingMessage('Computing routes…');
    setError(null);
    try {
      const src = sourceNode ?? nodes[0]?.id;
      const tgt = targetNode ?? nodes[nodes.length - 1]?.id;
      const res = await planRoute({
        source_node: src,
        target_node: tgt,
        initial_soc: initialSoc,
        initial_soh: initialSoh,
        algorithm: 'all',
      });
      setRoutes(res.routes as { shortest?: import('@/types').RouteResult; energy?: import('@/types').RouteResult; modified?: import('@/types').RouteResult });
      setSourceNode(res.source as number);
      setTargetNode(res.target as number);
      // Build comparison
      const rows = Object.values(res.routes).map((r) => ({
        algorithm: r!.algorithm,
        distance_km: r!.total_distance_km,
        energy_kwh: r!.total_energy_kwh,
        time_min: r!.total_time_min,
        charging_stops: r!.charging_stops.length,
        soc_final: r!.soc_final,
        soh_final: r!.soh_final,
        soh_impact: r!.soh_initial - r!.soh_final,
        feasible: r!.feasible,
        feasibility_score: r!.feasibility_score,
        battery_violations: r!.battery_violations,
        runtime_ms: r!.runtime_ms,
        path_length: r!.path.length,
      }));
      setComparison(rows);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Route planning failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleSimulate = async () => {
    if (!graphData) return;
    setIsLoading(true);
    setLoadingMessage('Running simulation…');
    setError(null);
    try {
      const src = sourceNode ?? nodes[0]?.id;
      const tgt = targetNode ?? nodes[nodes.length - 1]?.id;
      const res = await runSimulation({
        source_node: src,
        target_node: tgt,
        initial_soc: initialSoc,
        initial_soh: initialSoh,
        algorithm: activeAlgorithm,
      });
      setSimulation(res.simulation);
      setBatteryStatus(res.battery_summary);
      setMaintenance(res.maintenance);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Simulation failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  return (
    <div className="glass-card p-4 flex flex-col gap-3" style={{ flexShrink: 0 }}>
      <div className="flex items-center gap-2 mb-1">
        <Navigation size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Route Planning</h2>
      </div>

      {/* Source / Target */}
      <div className="grid grid-cols-2 gap-2">
        <NodeSelect
          label="Source"
          nodes={nodes}
          value={sourceNode}
          onChange={setSourceNode}
          color="#34d399"
        />
        <NodeSelect
          label="Target"
          nodes={nodes}
          value={targetNode}
          onChange={setTargetNode}
          color="#f87171"
        />
      </div>

      {/* Battery Config */}
      <div className="grid grid-cols-2 gap-2">
        <SliderInput
          label={`SoC: ${Math.round(initialSoc * 100)}%`}
          min={10} max={100} value={Math.round(initialSoc * 100)}
          onChange={(v) => setInitialSoc(v / 100)}
          color="#34d399"
        />
        <SliderInput
          label={`SoH: ${Math.round(initialSoh * 100)}%`}
          min={50} max={100} value={Math.round(initialSoh * 100)}
          onChange={(v) => setInitialSoh(v / 100)}
          color="#38bdf8"
        />
      </div>

      {/* Algorithm selector */}
      <div>
        <p className="section-header mb-2">Algorithm</p>
        <div className="grid grid-cols-3 gap-1">
          {ALGORITHMS.map((alg) => (
            <button
              key={alg.id}
              className="text-xs py-1.5 px-2 rounded-lg font-medium transition-all border"
              style={{
                background: activeAlgorithm === alg.id
                  ? `${alg.color}22`
                  : 'rgba(15,23,42,0.6)',
                borderColor: activeAlgorithm === alg.id ? alg.color : 'rgba(99,102,241,0.15)',
                color: activeAlgorithm === alg.id ? alg.color : '#64748b',
              }}
              onClick={() => setActiveAlgorithm(alg.id)}
            >
              {alg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-secondary flex items-center justify-center gap-2 text-xs"
          onClick={handlePlan}
          disabled={isLoading || !graphData}
        >
          <GitBranch size={12} />
          Plan Routes
        </button>
        <button
          className="btn-primary flex items-center justify-center gap-2 text-xs"
          onClick={handleSimulate}
          disabled={isLoading || !graphData}
        >
          <PlayCircle size={12} />
          Simulate
        </button>
      </div>
    </div>
  );
}

function NodeSelect({
  label, nodes, value, onChange, color,
}: {
  label: string;
  nodes: Array<{ id: number | string; name: string }>;
  value: number | string | null;
  onChange: (v: number | string) => void;
  color: string;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color }}>
        {label}
      </label>
      <select
        className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
        style={{
          background: 'rgba(15,23,42,0.8)',
          border: `1px solid rgba(99,102,241,0.2)`,
          color: '#e2e8f0',
        }}
        value={value ?? ''}
        onChange={(e) => onChange(isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
      >
        <option value="">Auto-select</option>
        {nodes.slice(0, 80).map((n) => (
          <option key={n.id} value={n.id}>
            {n.name ?? `Node ${n.id}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function SliderInput({
  label, min, max, value, onChange, color,
}: {
  label: string; min: number; max: number; value: number;
  onChange: (v: number) => void; color: string;
}) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color }}>{label}</label>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
        style={{ accentColor: color }}
      />
    </div>
  );
}

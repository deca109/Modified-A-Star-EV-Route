'use client';

import { useEVStore } from '@/state/store';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Zap, Route, Battery } from 'lucide-react';

const ALG_META: Record<string, { label: string; color: string; desc: string }> = {
  ShortestPath: { label: 'Shortest Path', color: '#38bdf8', desc: 'Dijkstra, distance only' },
  EnergyAware:  { label: 'Energy-Aware',  color: '#34d399', desc: 'A*, energy-cost weight' },
  ModifiedAStar:{ label: 'Modified A*',   color: '#818cf8', desc: 'Battery + SoH + traffic' },
};

export default function ComparisonPanel() {
  const { comparison } = useEVStore();

  if (comparison.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        Plan routes to see the algorithm comparison
      </div>
    );
  }

  const metrics = [
    { key: 'distance_km',       label: 'Distance',       unit: 'km',  icon: <Route size={11} />,   best: 'min' },
    { key: 'energy_kwh',        label: 'Energy',         unit: 'kWh', icon: <Zap size={11} />,     best: 'min' },
    { key: 'time_min',          label: 'Time',           unit: 'min', icon: <Clock size={11} />,   best: 'min' },
    { key: 'charging_stops',    label: 'Chg Stops',      unit: '',    icon: <Battery size={11} />, best: 'min' },
    { key: 'soc_final',         label: 'Final SoC',      unit: '%',   icon: <Zap size={11} />,     best: 'max', scale: 100 },
    { key: 'soh_final',         label: 'Final SoH',      unit: '%',   icon: <Battery size={11} />, best: 'max', scale: 100 },
    { key: 'feasibility_score', label: 'Feasibility',    unit: '',    icon: <CheckCircle size={11}/>, best: 'max' },
    { key: 'runtime_ms',        label: 'Runtime',        unit: 'ms',  icon: <Clock size={11} />,   best: 'min' },
  ] as const;

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-4">
        <p className="section-header mb-0">Algorithm Comparison</p>
        <div className="flex gap-3">
          {comparison.map((row) => {
            const meta = ALG_META[row.algorithm] ?? { label: row.algorithm, color: '#818cf8', desc: '' };
            return (
              <div key={row.algorithm} className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                <span style={{ color: meta.color }}>{meta.label}</span>
                <span className="text-slate-500">({meta.desc})</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left py-1.5 px-2 text-slate-400 font-medium">Metric</th>
              {comparison.map((row) => {
                const meta = ALG_META[row.algorithm] ?? { label: row.algorithm, color: '#818cf8' };
                return (
                  <th key={row.algorithm} className="text-right py-1.5 px-3 font-semibold" style={{ color: meta.color }}>
                    {meta.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Feasible row */}
            <tr className="border-b" style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
              <td className="py-1.5 px-2 text-slate-400 flex items-center gap-1.5">
                <CheckCircle size={11} /> Feasible
              </td>
              {comparison.map((row) => (
                <td key={row.algorithm} className="text-right py-1.5 px-3">
                  {row.feasible
                    ? <span className="badge badge-green">✓ Yes</span>
                    : <span className="badge badge-red">✗ No</span>}
                </td>
              ))}
            </tr>

            {metrics.map((m) => {
              const values = comparison.map((row) => {
                const v = row[m.key as keyof typeof row];
                return typeof v === 'number' ? v : 0;
              });
              const bestVal = m.best === 'min' ? Math.min(...values) : Math.max(...values);

              return (
                <tr key={m.key} className="border-b" style={{ borderColor: 'rgba(99,102,241,0.08)' }}>
                  <td className="py-1.5 px-2 text-slate-400 flex items-center gap-1.5">
                    {m.icon} {m.label}
                  </td>
                  {comparison.map((row, idx) => {
                    const raw = row[m.key as keyof typeof row];
                    const v = typeof raw === 'number' ? raw : 0;
                    const display = (m as any).scale ? (v * (m as any).scale).toFixed(1) : v.toFixed(2);
                    const isBest = v === bestVal;
                    return (
                      <td key={row.algorithm} className="text-right py-1.5 px-3">
                        <span
                          className={`font-mono ${isBest ? 'font-bold' : ''}`}
                          style={{ color: isBest ? '#34d399' : '#94a3b8' }}
                        >
                          {display}{m.unit}
                          {isBest && <span className="ml-1 text-xs">★</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

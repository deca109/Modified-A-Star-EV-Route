'use client';

import { useEVStore } from '@/state/store';
import { CheckCircle, Clock, Zap, Route, Battery, BarChart2 } from 'lucide-react';

const ALG_META: Record<string, { label: string; color: string; desc: string }> = {
  ShortestPath: { label: 'Shortest Path', color: '#38bdf8', desc: 'Dijkstra, distance only' },
  EnergyAware:  { label: 'Energy-Aware',  color: '#34d399', desc: 'A*, energy-cost weight' },
  ModifiedAStar:{ label: 'Modified A*',   color: '#818cf8', desc: 'Battery + SoH + traffic' },
};

export default function ComparisonPanel() {
  const { comparison } = useEVStore();

  if (comparison.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center">
          <BarChart2 size={22} className="text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">No Comparison Data</p>
          <p className="text-xs text-slate-500 leading-relaxed mt-1 max-w-xs">
            Plan routes using the Route Planning panel to see a side-by-side algorithm comparison.
          </p>
        </div>
      </div>
    );
  }

  const metrics = [
    { key: 'distance_km',       label: 'Distance',    unit: 'km',  icon: <Route size={10} />,      best: 'min' },
    { key: 'energy_kwh',        label: 'Energy',      unit: 'kWh', icon: <Zap size={10} />,        best: 'min' },
    { key: 'time_min',          label: 'Time',        unit: 'min', icon: <Clock size={10} />,      best: 'min' },
    { key: 'charging_stops',    label: 'Chg Stops',   unit: '',    icon: <Battery size={10} />,    best: 'min' },
    { key: 'soc_final',         label: 'Final SoC',   unit: '%',   icon: <Zap size={10} />,        best: 'max', scale: 100 },
    { key: 'soh_final',         label: 'Final SoH',   unit: '%',   icon: <Battery size={10} />,    best: 'max', scale: 100 },
    { key: 'feasibility_score', label: 'Feasibility', unit: '',    icon: <CheckCircle size={10} />, best: 'max' },
    { key: 'runtime_ms',        label: 'Runtime',     unit: 'ms',  icon: <Clock size={10} />,      best: 'min' },
  ] as const;

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Legend row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 shrink-0">
        <p className="section-header mb-0 tracking-widest text-[10px]">Algorithm Comparison</p>
      </div>

      {/* Scrollable table wrapper */}
      <div className="flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-slate-800/60">
        <table
          className="text-xs"
          style={{ minWidth: '900px', width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead>
            <tr style={{ background: 'rgba(7, 11, 20, 0.98)', position: 'sticky', top: 0, zIndex: 10 }}>
              <th className="text-left py-3 px-4 text-slate-400 font-bold tracking-widest text-[10px] uppercase border-b border-slate-800">
                Metric
              </th>
              {comparison.map((row) => {
                const meta = ALG_META[row.algorithm] ?? { label: row.algorithm, color: '#818cf8' };
                return (
                  <th
                    key={row.algorithm}
                    className="text-right py-3 px-4 font-bold tracking-widest text-[10px] uppercase border-b border-slate-800"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Feasible row */}
            <tr className="hover:bg-slate-900/30 transition-colors" style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
              <td className="py-2.5 px-4 text-slate-400 font-medium">
                <span className="flex items-center gap-1.5"><CheckCircle size={10} /> Feasible</span>
              </td>
              {comparison.map((row) => (
                <td key={row.algorithm} className="text-right py-2.5 px-4">
                  {row.feasible
                    ? <span className="badge badge-green" style={{ fontSize: 10, padding: '2px 8px' }}>✓ Yes</span>
                    : <span className="badge badge-red"   style={{ fontSize: 10, padding: '2px 8px' }}>✗ No</span>}
                </td>
              ))}
            </tr>

            {metrics.map((m, rowIdx) => {
              const values = comparison.map((row) => {
                const v = row[m.key as keyof typeof row];
                return typeof v === 'number' ? v : 0;
              });
              const bestVal = m.best === 'min' ? Math.min(...values) : Math.max(...values);

              return (
                <tr
                  key={m.key}
                  className="transition-colors hover:bg-indigo-950/20"
                  style={{
                    background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.18)',
                    borderBottom: '1px solid rgba(30,41,59,0.4)',
                  }}
                >
                  <td className="py-2.5 px-4 text-slate-400 font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">{m.icon} {m.label}</span>
                  </td>
                  {comparison.map((row) => {
                    const raw = row[m.key as keyof typeof row];
                    const v = typeof raw === 'number' ? raw : 0;
                    const display = (m as any).scale
                      ? (v * (m as any).scale).toFixed(1)
                      : v.toFixed(2);
                    const isBest = v === bestVal;
                    return (
                      <td key={row.algorithm} className="text-right py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`font-mono ${isBest ? 'font-bold' : 'font-medium'}`}
                          style={{ color: isBest ? '#34d399' : '#94a3b8' }}
                        >
                          {display}{m.unit}
                          {isBest && <span className="ml-1 opacity-75">★</span>}
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

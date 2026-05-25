'use client';

import { useEVStore } from '@/state/store';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

const CHART_STYLE = {
  background: 'transparent',
  fontSize: 10,
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-sm p-2 text-xs">
      <p className="text-slate-400 mb-1">Step {label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</p>
      ))}
    </div>
  );
};

export default function AnalyticsPanel() {
  const { simulation, comparison } = useEVStore();

  const steps = simulation?.steps ?? [];

  // Subsample for performance
  const sampled = steps.filter((_, i) => i % Math.max(1, Math.floor(steps.length / 40)) === 0);

  const socData = sampled.map((s) => ({
    step: s.step, SoC: +(s.soc * 100).toFixed(1), SoH: +(s.soh * 100).toFixed(1),
  }));

  const energyData = sampled.map((s) => ({
    step: s.step,
    'Cumulative Energy (kWh)': +s.cumulative_energy_kwh.toFixed(3),
    Speed: +s.speed_kmh.toFixed(0),
  }));

  const compData = comparison.map((c) => ({
    name: c.algorithm === 'ShortestPath' ? 'Shortest'
         : c.algorithm === 'EnergyAware' ? 'Energy'
         : 'Modified A*',
    'Distance km': +c.distance_km.toFixed(2),
    'Energy kWh': +c.energy_kwh.toFixed(3),
    'Time min': +c.time_min.toFixed(1),
    'Feasibility': +(c.feasibility_score * 100).toFixed(0),
  }));

  if (steps.length === 0 && comparison.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        Run a simulation to view analytics charts
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* SoC / SoH over time */}
      {steps.length > 0 && (
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="section-header">SoC & SoH over Time</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={socData} style={CHART_STYLE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
                <XAxis dataKey="step" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="SoC" stroke="#34d399" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="SoH" stroke="#38bdf8" dot={false} strokeWidth={2} />
                <ReferenceLine y={10} stroke="#f87171" strokeDasharray="4 4" label={{ value: 'Min', fill: '#f87171', fontSize: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Energy consumption */}
      {steps.length > 0 && (
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="section-header">Energy & Speed</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={energyData} style={CHART_STYLE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
                <XAxis dataKey="step" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="Cumulative Energy (kWh)" stroke="#818cf8" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Speed" stroke="#fbbf24" dot={false} strokeWidth={1} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Comparison bar chart */}
      {comparison.length > 0 && (
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="section-header">Algorithm Comparison</p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} style={CHART_STYLE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                <Bar dataKey="Energy kWh" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Distance km" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Feasibility" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

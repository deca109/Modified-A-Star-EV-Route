'use client';

import { useEVStore } from '@/state/store';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Wrench, TrendingDown, ShieldCheck } from 'lucide-react';

const RISK_META = {
  Low:      { color: '#34d399', icon: '✅', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)' },
  Moderate: { color: '#fbbf24', icon: '🟡', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)' },
  High:     { color: '#fb923c', icon: '🟠', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.25)' },
  Critical: { color: '#f87171', icon: '🔴', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
};

export default function MaintenancePanel() {
  const { maintenance } = useEVStore();

  if (!maintenance) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-center">
          <ShieldCheck size={22} className="text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">No Maintenance Data</p>
          <p className="text-xs text-slate-500 leading-relaxed mt-1 max-w-xs">
            Run a simulation or demo scenario to see predictive maintenance analysis and battery health forecasts.
          </p>
        </div>
      </div>
    );
  }

  const risk = RISK_META[maintenance.health_risk_level] ?? RISK_META.Low;
  const pctLifeUsed = maintenance.details.pct_life_used;

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Risk indicator */}
      <div
        className="flex flex-col items-center justify-center gap-3 px-5 rounded-2xl border shrink-0"
        style={{ background: risk.bg, borderColor: risk.border, minWidth: 140 }}
      >
        <span className="text-4xl leading-none">{risk.icon}</span>
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Health Risk</p>
          <p className="text-lg font-extrabold mt-1 leading-none" style={{ color: risk.color }}>
            {maintenance.health_risk_level}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confidence</p>
          <p className="text-base font-bold text-slate-200 font-mono mt-1">
            {(maintenance.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* RUL */}
      <div className="flex flex-col justify-center gap-3 shrink-0 w-44">
        <div className="stat-card text-center py-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remaining Useful Life</p>
          <p className="text-2xl font-bold text-indigo-400 font-mono mt-2">
            {maintenance.rul_cycles.toFixed(0)}
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">cycles</p>
        </div>
        <div className="stat-card text-center py-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Range Remaining</p>
          <p className="text-2xl font-bold text-green-400 font-mono mt-2">
            {(maintenance.rul_km_estimate / 1000).toFixed(0)}k
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">km</p>
        </div>
        <div className="px-1">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
            <span className="font-bold uppercase tracking-wider">Life Used</span>
            <span className="font-mono font-bold text-slate-200">{pctLifeUsed.toFixed(1)}%</span>
          </div>
          <div className="progress-track">
            <motion.div
              className="progress-fill"
              style={{
                background: pctLifeUsed > 80
                  ? 'linear-gradient(90deg, #fb923c, #f87171)'
                  : pctLifeUsed > 60
                  ? 'linear-gradient(90deg, #fbbf24, #fb923c)'
                  : 'linear-gradient(90deg, #34d399, #38bdf8)',
              }}
              initial={{ width: 0 }}
              animate={{ width: `${pctLifeUsed}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>
      </div>

      {/* Warnings */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto scrollbar-none min-w-0">
        <p className="section-header tracking-widest text-[10px] shrink-0">Warnings &amp; Recommendations</p>
        <div className="flex flex-col gap-2">
          {maintenance.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-red-950/20 border border-red-900/20 rounded-lg px-3 py-2">
              <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
              <span className="text-slate-300 leading-relaxed">{w}</span>
            </div>
          ))}
        </div>
        {maintenance.recommendations.length > 0 && (
          <>
            <p className="section-header mt-2 tracking-widest text-[10px] shrink-0">Recommendations</p>
            <div className="flex flex-col gap-2">
              {maintenance.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-indigo-950/20 border border-indigo-900/20 rounded-lg px-3 py-2">
                  <span className="text-indigo-400 font-bold shrink-0 mt-0.5">→</span>
                  <span className="text-slate-400 leading-relaxed">{r}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Details */}
      <div className="w-44 flex flex-col gap-1.5 overflow-y-auto scrollbar-none shrink-0">
        <p className="section-header tracking-widest text-[10px]">Battery Details</p>
        {[
          ['SoH', `${(maintenance.details.soh * 100).toFixed(1)}%`],
          ['SoC', `${(maintenance.details.soc * 100).toFixed(1)}%`],
          ['Cycles', maintenance.details.cycle_count.toFixed(1)],
          ['Deep Discharge', maintenance.details.deep_discharge_count],
          ['Energy Used', `${maintenance.details.total_energy_discharged_kwh.toFixed(0)} kWh`],
          ['Model', maintenance.details.model_type],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between items-center text-xs py-1 border-b border-slate-900/50">
            <span className="text-slate-500 font-medium">{label}</span>
            <span className="text-slate-300 font-mono font-semibold">{value}</span>
          </div>
        ))}
        <div className="flex justify-between items-center text-xs py-1">
          <span className="text-slate-500 font-medium">Stress Score</span>
          <span
            className="font-mono font-bold"
            style={{
              color: maintenance.battery_stress_score > 0.7 ? '#f87171'
                   : maintenance.battery_stress_score > 0.4 ? '#fbbf24' : '#34d399',
            }}
          >
            {(maintenance.battery_stress_score * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

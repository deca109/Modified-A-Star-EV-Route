'use client';

import { useEVStore } from '@/state/store';
import { motion } from 'framer-motion';
import { Shield, AlertTriangle, Wrench, TrendingDown } from 'lucide-react';

const RISK_META = {
  Low:      { color: '#34d399', icon: '✅', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
  Moderate: { color: '#fbbf24', icon: '🟡', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
  High:     { color: '#fb923c', icon: '🟠', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)' },
  Critical: { color: '#f87171', icon: '🔴', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
};

export default function MaintenancePanel() {
  const { maintenance } = useEVStore();

  if (!maintenance) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        Run a simulation or demo scenario to see maintenance predictions
      </div>
    );
  }

  const risk = RISK_META[maintenance.health_risk_level] ?? RISK_META.Low;
  const pctLifeUsed = maintenance.details.pct_life_used;

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Risk indicator */}
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 rounded-xl border"
        style={{ background: risk.bg, borderColor: risk.border, flexShrink: 0, minWidth: 150 }}
      >
        <span className="text-4xl">{risk.icon}</span>
        <div className="text-center">
          <p className="text-xs text-slate-400">Health Risk</p>
          <p className="text-xl font-bold" style={{ color: risk.color }}>
            {maintenance.health_risk_level}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-400">Confidence</p>
          <p className="text-sm font-semibold text-slate-200">
            {(maintenance.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* RUL */}
      <div className="flex flex-col justify-center gap-3" style={{ flexShrink: 0, width: 160 }}>
        <div className="stat-card text-center py-3">
          <p className="text-xs text-slate-500">Remaining Useful Life</p>
          <p className="text-2xl font-bold text-indigo-400 font-mono">
            {maintenance.rul_cycles.toFixed(0)}
          </p>
          <p className="text-xs text-slate-400">cycles</p>
        </div>
        <div className="stat-card text-center py-3">
          <p className="text-xs text-slate-500">Est. Range Remaining</p>
          <p className="text-2xl font-bold text-green-400 font-mono">
            {(maintenance.rul_km_estimate / 1000).toFixed(0)}k
          </p>
          <p className="text-xs text-slate-400">km</p>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Life Used</span>
            <span>{pctLifeUsed.toFixed(1)}%</span>
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
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
        <p className="section-header">Warnings & Recommendations</p>
        <div className="flex flex-col gap-1.5">
          {maintenance.warnings.map((w, i) => (
            <p key={i} className="text-xs text-slate-300 leading-relaxed">{w}</p>
          ))}
        </div>
        {maintenance.recommendations.length > 0 && (
          <>
            <p className="section-header mt-2">Recommendations</p>
            <div className="flex flex-col gap-1.5">
              {maintenance.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="text-indigo-400 mt-0.5">→</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Details */}
      <div className="w-44 flex flex-col gap-1.5 overflow-y-auto" style={{ flexShrink: 0 }}>
        <p className="section-header">Battery Details</p>
        {[
          ['SoH', `${(maintenance.details.soh * 100).toFixed(1)}%`],
          ['SoC', `${(maintenance.details.soc * 100).toFixed(1)}%`],
          ['Cycles', maintenance.details.cycle_count.toFixed(1)],
          ['Deep Discharge', maintenance.details.deep_discharge_count],
          ['Energy Used', `${maintenance.details.total_energy_discharged_kwh.toFixed(0)} kWh`],
          ['Model', maintenance.details.model_type],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-300 font-mono">{value}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Stress Score</span>
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

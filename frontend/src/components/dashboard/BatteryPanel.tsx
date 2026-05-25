'use client';

import { useEVStore } from '@/state/store';
import { motion } from 'framer-motion';
import { Zap, Battery, Activity, ThermometerSun } from 'lucide-react';

function SemiGauge({ value, color, label, sublabel }: {
  value: number; color: string; label: string; sublabel?: string;
}) {
  const R = 48;
  const circumference = Math.PI * R;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, value)));

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 110, height: 70 }}>
        <svg width={110} height={80} viewBox="0 0 110 80">
          {/* Track */}
          <path
            d="M10,70 A48,48 0 0,1 100,70"
            fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={10} strokeLinecap="round"
          />
          {/* Fill */}
          <motion.path
            d="M10,70 A48,48 0 0,1 100,70"
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          {/* Value text */}
          <text x="55" y="68" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="Inter">
            {Math.round(value * 100)}
          </text>
          <text x="55" y="78" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="Inter">
            %
          </text>
        </svg>
      </div>
      <p className="text-xs font-semibold text-slate-300 -mt-1">{label}</p>
      {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
    </div>
  );
}

export default function BatteryPanel() {
  const { simulation, simulationStep, batteryStatus } = useEVStore();

  const currentStep = simulation?.steps[simulationStep];
  const soc = currentStep?.soc ?? simulation?.initial_soc ?? batteryStatus?.soc ?? 0.85;
  const soh = currentStep?.soh ?? simulation?.initial_soh ?? batteryStatus?.soh ?? 0.95;
  const stress = currentStep?.stress_score ?? batteryStatus?.stress_score ?? 0.1;

  const chargingEvents = simulation?.charging_stops ?? batteryStatus?.charging_events ?? [];
  const alerts = simulation?.maintenance_alerts ?? [];

  const socColor = soc > 0.5 ? '#34d399' : soc > 0.25 ? '#fbbf24' : '#f87171';
  const sohColor = soh > 0.8 ? '#38bdf8' : soh > 0.65 ? '#fbbf24' : '#f87171';

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Gauges */}
      <div className="flex items-center gap-6 px-4">
        <SemiGauge value={soc} color={socColor} label="State of Charge" sublabel="SoC" />
        <SemiGauge value={soh} color={sohColor} label="State of Health" sublabel="SoH" />
        <SemiGauge value={stress} color="#f87171" label="Battery Stress" sublabel="Stress Score" />
      </div>

      {/* Stats */}
      <div className="flex-1 grid grid-cols-3 gap-2 content-start">
        <StatMini label="Capacity" value={`${batteryStatus?.capacity_kwh ?? 75} kWh`} icon={<Battery size={11}/>} color="#818cf8" />
        <StatMini label="Usable Energy" value={`${batteryStatus?.usable_energy_kwh?.toFixed(1) ?? '–'} kWh`} icon={<Zap size={11}/>} color="#34d399" />
        <StatMini label="Cycles" value={batteryStatus?.cycle_count?.toFixed(1) ?? '–'} icon={<Activity size={11}/>} color="#fbbf24" />
        <StatMini label="Deep Discharges" value={batteryStatus?.deep_discharge_count ?? '–'} icon={<ThermometerSun size={11}/>} color="#f87171" />
        <StatMini label="Total Discharged" value={`${batteryStatus?.total_energy_discharged_kwh?.toFixed(1) ?? '–'} kWh`} icon={<Zap size={11}/>} color="#38bdf8" />
        <StatMini label="Charge Events" value={chargingEvents.length} icon={<Battery size={11}/>} color="#f472b6" />
      </div>

      {/* Charging history + alerts */}
      <div className="w-56 flex flex-col gap-2 overflow-hidden">
        {alerts.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="section-header">Alerts</p>
            {alerts.map((a, i) => (
              <p key={i} className="text-xs text-slate-300 mb-1 leading-tight">{a}</p>
            ))}
          </div>
        )}
        {chargingEvents.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="section-header">Charging Events</p>
            {chargingEvents.map((e, i) => (
              <div key={i} className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 truncate w-28">{e.station_name}</span>
                <span className="text-green-400 font-mono">{(e.energy_added_kwh).toFixed(2)} kWh</span>
              </div>
            ))}
          </div>
        )}
        {alerts.length === 0 && chargingEvents.length === 0 && (
          <p className="text-xs text-slate-500">Run a simulation to see battery events</p>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="stat-card flex items-center gap-2 py-2 px-3">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-400 leading-none">{label}</p>
        <p className="text-sm font-bold text-slate-200 font-mono leading-none mt-0.5">{value}</p>
      </div>
    </div>
  );
}

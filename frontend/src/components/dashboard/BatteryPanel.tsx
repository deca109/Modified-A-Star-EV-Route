'use client';

import { useEVStore } from '@/state/store';
import { motion } from 'framer-motion';
import { Zap, Battery, Activity, ThermometerSun, AlertCircle } from 'lucide-react';

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
            fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth={8} strokeLinecap="round"
          />
          {/* Fill */}
          <motion.path
            d="M10,70 A48,48 0 0,1 100,70"
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
          />
          {/* Value text */}
          <text x="55" y="66" textAnchor="middle" fill="#f8fafc" fontSize="16" fontWeight="700" fontFamily="Inter">
            {Math.round(value * 100)}
          </text>
          <text x="55" y="76" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600" fontFamily="Inter">
            %
          </text>
        </svg>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider -mt-1">{label}</p>
      {sublabel && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sublabel}</p>}
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
    <div className="h-full flex flex-col gap-4 overflow-y-auto scrollbar-none pb-2">
      {/* Top grid: Gauges & Lists */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[160px]">
        {/* Live battery gauges */}
        <div className="flex-1 flex items-center justify-around gap-4 px-4 py-3 bg-[#070b14]/30 border border-slate-900 rounded-2xl">
          <SemiGauge value={soc} color={socColor} label="Charge" sublabel="SoC" />
          <SemiGauge value={soh} color={sohColor} label="Health" sublabel="SoH" />
          <SemiGauge value={stress} color="#f87171" label="Stress" sublabel="Stress Score" />
        </div>

        {/* Warnings & logs */}
        <div className="w-full lg:w-72 flex flex-col gap-2 p-3 bg-[#070b14]/30 border border-slate-900 rounded-2xl min-h-[100px] max-h-[160px] lg:max-h-none overflow-y-auto scrollbar-none">
          {alerts.length > 0 && (
            <div className="flex-1 overflow-y-auto scrollbar-none">
              <p className="section-header mb-1.5 tracking-widest text-[9px]">Alerts</p>
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-red-400 mb-1 leading-tight font-medium">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}
          {chargingEvents.length > 0 && (
            <div className="flex-1 overflow-y-auto scrollbar-none mt-2">
              <p className="section-header mb-1.5 tracking-widest text-[9px]">Charging Events</p>
              {chargingEvents.map((e, i) => (
                <div key={i} className="flex justify-between items-center text-xs mb-1 py-0.5 border-b border-slate-900/50">
                  <span className="text-slate-400 truncate w-36 font-medium">{e.station_name}</span>
                  <span className="text-green-400 font-mono font-semibold">{(e.energy_added_kwh).toFixed(1)} kWh</span>
                </div>
              ))}
            </div>
          )}
          {alerts.length === 0 && chargingEvents.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-2">
              <Activity size={14} className="text-slate-600 mb-1 animate-pulse" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Telemetry Events</p>
              <p className="text-[9px] text-slate-500 leading-normal mt-0.5">Run a route simulation to view real-time battery log details.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid: Metrics Cards */}
      <div>
        <p className="section-header mb-2.5 tracking-widest text-[9px]">Footer Metrics Telemetry</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatMini label="Capacity" value={`${batteryStatus?.capacity_kwh ?? 75} kWh`} icon={<Battery size={13}/>} color="#818cf8" />
          <StatMini label="Usable Energy" value={`${batteryStatus?.usable_energy_kwh?.toFixed(1) ?? '–'} kWh`} icon={<Zap size={13}/>} color="#34d399" />
          <StatMini label="Cycles" value={batteryStatus?.cycle_count?.toFixed(1) ?? '–'} icon={<Activity size={13}/>} color="#fbbf24" />
          <StatMini label="Deep Discharges" value={batteryStatus?.deep_discharge_count ?? '–'} icon={<ThermometerSun size={13}/>} color="#f87171" />
          <StatMini label="Total Discharged" value={`${batteryStatus?.total_energy_discharged_kwh?.toFixed(1) ?? '–'} kWh`} icon={<Zap size={13}/>} color="#38bdf8" />
          <StatMini label="Charge Events" value={chargingEvents.length} icon={<Battery size={13}/>} color="#f472b6" />
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="stat-card flex items-center gap-3 py-3 px-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold leading-none">{label}</p>
        <p className="text-base font-bold text-slate-200 font-mono leading-none mt-1.5 truncate">{value}</p>
      </div>
    </div>
  );
}

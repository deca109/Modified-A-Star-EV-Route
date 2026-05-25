'use client';

import { motion } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { Zap, Activity, BarChart3, Wrench, Map } from 'lucide-react';

const panels = [
  { id: 'map', icon: Map, label: 'Live Map' },
  { id: 'battery', icon: Zap, label: 'Battery' },
  { id: 'comparison', icon: BarChart3, label: 'Comparison' },
  { id: 'maintenance', icon: Wrench, label: 'Maintenance' },
  { id: 'analytics', icon: Activity, label: 'Analytics' },
] as const;

export default function Header() {
  const {
    activePanel,
    setActivePanel,
    backendOnline,
    isLoading,
    loadingMessage,
  } = useEVStore();

  return (
    <header
      className="flex items-center justify-between px-4 py-2 border-b"
      style={{
        background: 'rgba(11, 18, 32, 0.95)',
        borderColor: 'rgba(99, 102, 241, 0.15)',
        backdropFilter: 'blur(16px)',
        height: '56px',
        flexShrink: 0,
      }}
    >
      {/* Left Area: Logo */}
      <div className="flex items-center gap-2 md:gap-3">

        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <Zap size={15} className="text-white" />
            </div>
            {backendOnline && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-950 animate-pulse" />
            )}
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xs md:text-sm font-extrabold tracking-tight gradient-text uppercase">EV Route Optimizer</h1>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5 font-medium">A* · Clustering · Fuzzy RL</p>
          </div>
        </div>
      </div>

      {/* Center Area: Tab Navigation */}
      <nav className="tab-nav mx-4 max-w-[50%] sm:max-w-none">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`tab-item ${activePanel === id ? 'active' : ''}`}
            onClick={() => setActivePanel(id)}
          >
            <Icon size={12} />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </nav>

      {/* Right Area: Status & Mobile Right Toggle */}
      <div className="flex items-center gap-2 md:gap-3 text-xs">
        {isLoading && (
          <motion.div
            className="hidden sm:flex items-center gap-2 text-slate-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          >
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] truncate max-w-[100px]">{loadingMessage}</span>
          </motion.div>
        )}
        <div className={`badge ${backendOnline ? 'badge-green' : 'badge-red'} py-2 px-2.5 flex items-center gap-2`}>
          <span>Backend {backendOnline ? 'Online' : 'Offline'}</span>
        </div>


      </div>
    </header>
  );
}


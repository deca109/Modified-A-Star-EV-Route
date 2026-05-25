'use client';

import { motion } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { Zap, Activity, BarChart3, Wrench, Map } from 'lucide-react';

const panels = [
  { id: 'map',         icon: Map,      label: 'Live Map'     },
  { id: 'battery',     icon: Zap,      label: 'Battery'      },
  { id: 'comparison',  icon: BarChart3, label: 'Comparison'  },
  { id: 'maintenance', icon: Wrench,   label: 'Maintenance'  },
  { id: 'analytics',   icon: Activity,  label: 'Analytics'   },
] as const;

export default function Header() {
  const { activePanel, setActivePanel, backendOnline, isLoading, loadingMessage } = useEVStore();

  return (
    <header
      className="flex items-center justify-between px-4 py-2 border-b"
      style={{
        background: 'rgba(3, 7, 18, 0.95)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(16px)',
        height: '56px',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <Zap size={16} className="text-white" />
          </div>
          {backendOnline && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" />
          )}
        </div>
        <div>
          <h1 className="text-sm font-bold leading-none gradient-text">EV Route Optimizer</h1>
          <p className="text-xs text-slate-500 leading-none mt-0.5">Modified A* · Spectral Clustering · Fuzzy RL</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={`tab-item ${activePanel === id ? 'active' : ''}`}
            onClick={() => setActivePanel(id)}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Status */}
      <div className="flex items-center gap-3 text-xs">
        {isLoading && (
          <motion.div
            className="flex items-center gap-2 text-slate-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          >
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>{loadingMessage}</span>
          </motion.div>
        )}
        <div className={`badge ${backendOnline ? 'badge-green' : 'badge-red'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {backendOnline ? 'Backend Online' : 'Backend Offline'}
        </div>
      </div>
    </header>
  );
}

'use client';

import { useEVStore } from '@/state/store';
import { Network, Database, MapPin, Layers, Footprints, Settings } from 'lucide-react';

export default function StatusBar() {
  const { graphData, stations, clusters, simulation, routes } = useEVStore();

  const stats = [
    { label: 'Nodes', value: graphData?.node_count ?? '–', icon: <Network size={14} className="text-indigo-400" /> },
    { label: 'Edges', value: graphData?.edge_count ?? '–', icon: <Database size={14} className="text-cyan-400" /> },
    { label: 'Stations', value: stations.length || '–', icon: <MapPin size={14} className="text-amber-400" /> },
    { label: 'Clusters', value: clusters.length || '–', icon: <Layers size={14} className="text-purple-400" /> },
    { label: 'Route Steps', value: simulation?.steps.length ?? '–', icon: <Footprints size={14} className="text-green-400" /> },
    { label: 'Algorithm', value: routes ? 'Modified A*' : '–', icon: <Settings size={14} className="text-pink-400" /> },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-4 px-6 py-2.5 border-b"

      style={{
        background: 'rgba(11, 18, 32, 0.4)',
        borderColor: 'rgba(99, 102, 241, 0.08)',
        flexShrink: 0,
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/40 border border-slate-800/80 rounded-full text-xs hover:border-slate-700/80 transition-colors"
        >
          {s.icon}
          <span className="text-slate-400 font-medium">{s.label}:</span>
          <span className="text-slate-100 font-mono font-semibold">{s.value}</span>
        </div>
      ))}
    </div>
  );
}


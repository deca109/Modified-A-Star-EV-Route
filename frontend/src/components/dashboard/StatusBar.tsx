'use client';

import { useEVStore } from '@/state/store';

export default function StatusBar() {
  const { graphData, stations, clusters, simulation, routes } = useEVStore();

  const stats = [
    { label: 'Nodes',    value: graphData?.node_count ?? '–' },
    { label: 'Edges',    value: graphData?.edge_count ?? '–' },
    { label: 'Stations', value: stations.length || '–'       },
    { label: 'Clusters', value: clusters.length || '–'       },
    { label: 'Route Steps', value: simulation?.steps.length ?? '–' },
    { label: 'Algorithm', value: routes ? 'Modified A*' : '–' },
  ];

  return (
    <div
      className="flex items-center gap-6 px-4 py-1.5 border-b"
      style={{
        background: 'rgba(15, 23, 42, 0.6)',
        borderColor: 'rgba(99,102,241,0.1)',
        flexShrink: 0,
      }}
    >
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">{s.label}:</span>
          <span className="text-slate-300 font-mono font-semibold">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

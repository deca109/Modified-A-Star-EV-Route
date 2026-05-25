'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { checkHealth, fetchGraph, fetchChargingStations, fetchClusters, fetchDemoScenarios } from '@/services/api';
import Header from '@/components/dashboard/Header';
import Sidebar from '@/components/dashboard/Sidebar';
import BatteryPanel from '@/components/dashboard/BatteryPanel';
import ComparisonPanel from '@/components/dashboard/ComparisonPanel';
import MaintenancePanel from '@/components/dashboard/MaintenancePanel';
import AnalyticsPanel from '@/components/dashboard/AnalyticsPanel';
import DemoLauncher from '@/components/dashboard/DemoLauncher';
import RouteControls from '@/components/dashboard/RouteControls';
import StatusBar from '@/components/dashboard/StatusBar';

// Leaflet must be loaded client-side only
const EVMap = dynamic(() => import('@/components/map/EVMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full glass-card rounded-2xl">
      <div className="text-center">
        <div className="animate-spin-slow text-6xl mb-4">⚡</div>
        <p className="text-slate-400 text-sm font-medium">Loading map…</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const {
    activePanel,
    setBackendOnline,
    setGraphData,
    setStations,
    setClusters,
    setDemoScenarios,
    setIsLoading,
    setLoadingMessage,
    setError,
  } = useEVStore();

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      setLoadingMessage('Connecting to backend…');
      try {
        await checkHealth();
        setBackendOnline(true);
        setLoadingMessage('Loading road network…');
        const [graphRes, stationsRes, clustersRes, scenariosRes] = await Promise.all([
          fetchGraph(200),
          fetchChargingStations(),
          fetchClusters(),
          fetchDemoScenarios(),
        ]);
        setGraphData(graphRes);
        setStations(stationsRes.stations);
        setClusters(clustersRes.clusters);
        setDemoScenarios(scenariosRes.scenarios);
      } catch (e) {
        setBackendOnline(false);
        setError('Backend offline. Start the FastAPI server first.');
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    }
    init();
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Header />
      <StatusBar />

      {/* ── Main layout: Left Sidebar | Content | Right Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ─────────────────────────────────────── */}
        <Sidebar />

        {/* ── Main Content Area ────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden p-4 gap-4 min-w-0">

          {/* Top: Map + Right Panel */}
          <div className="flex flex-1 gap-4 overflow-hidden min-h-0">

            {/* Map */}
            <motion.div
              className="flex-1 relative overflow-hidden rounded-2xl min-w-0"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <EVMap />
            </motion.div>

            {/* Right Panel: Route Controls + Demo Launcher */}
            <div
              className="flex flex-col gap-3 overflow-y-auto scrollbar-none shrink-0"
              style={{ width: '300px' }}
            >
              <RouteControls />
              <DemoLauncher />
            </div>
          </div>

          {/* Bottom Panel (tabbed) */}
          <motion.div
            className="glass-card p-4 overflow-hidden shrink-0"
            style={{ height: '17rem' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            {activePanel === 'battery'    && <BatteryPanel />}
            {activePanel === 'comparison' && <ComparisonPanel />}
            {activePanel === 'maintenance'&& <MaintenancePanel />}
            {activePanel === 'analytics'  && <AnalyticsPanel />}
            {activePanel === 'map'        && <BatteryPanel />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

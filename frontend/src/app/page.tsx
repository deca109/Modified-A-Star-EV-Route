'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
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

  const [bottomHeight, setBottomHeight] = useState(272); // 17rem = 272px
  const isResizing = useRef(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    isResizing.current = true;
    const startY = mouseDownEvent.clientY;
    const startHeight = bottomHeight;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaY = startY - mouseMoveEvent.clientY;
      const newHeight = Math.max(160, Math.min(window.innerHeight * 0.7, startHeight + deltaY));
      setBottomHeight(newHeight);
      window.dispatchEvent(new Event('resize'));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

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
              className="flex-1 relative overflow-hidden rounded-2xl min-w-0 border border-slate-800/80 transition-all duration-300"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ 
                scale: 1.02,
                borderColor: 'rgba(56, 189, 248, 0.5)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(56, 189, 248, 0.3)',
                zIndex: 10
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 20,
                opacity: { duration: 0.4 },
                scale: { type: 'spring', stiffness: 300, damping: 20 }
              }}
            >
              <EVMap />
            </motion.div>

            {/* Right Panel: Route Controls + Demo Launcher */}
            <div
              className="flex flex-col gap-3 overflow-y-auto scrollbar-none shrink-0"
              style={{ width: '390px' }}
            >
              <RouteControls />
              <DemoLauncher />
            </div>
          </div>

          {/* Bottom Panel (tabbed) */}
          <motion.div
            className="glass-card p-4 overflow-hidden shrink-0 relative pt-7"
            style={{ height: bottomHeight }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            {/* Drag Handle */}
            <div
              className="absolute top-0 left-0 right-0 h-6 cursor-ns-resize z-50 flex items-center justify-center group"
              onMouseDown={startResizing}
            >
              {/* Full-width top edge accent bar */}
              <div className="absolute inset-x-0 top-0 h-[3px] bg-slate-600/60 group-hover:bg-cyan-400/70 group-hover:shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-200" />
              {/* Grip dots pill */}
              <div className="relative flex items-center gap-[5px] px-3 py-[3px] rounded-full bg-slate-700/80 border border-slate-600/50 group-hover:border-cyan-400/60 group-hover:bg-slate-700 transition-all duration-200 shadow-md">
                {[...Array(5)].map((_, i) => (
                  <span
                    key={i}
                    className="block w-[5px] h-[5px] rounded-full bg-slate-400 group-hover:bg-cyan-400 transition-colors duration-200"
                  />
                ))}
              </div>
            </div>

            {activePanel === 'battery' && <BatteryPanel />}
            {activePanel === 'comparison' && <ComparisonPanel />}
            {activePanel === 'maintenance' && <MaintenancePanel />}
            {activePanel === 'analytics' && <AnalyticsPanel />}
            {activePanel === 'map' && <BatteryPanel />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

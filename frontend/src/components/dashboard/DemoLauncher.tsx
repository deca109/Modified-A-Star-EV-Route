'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { runDemoScenario } from '@/services/api';
import { Rocket, ChevronDown, Play } from 'lucide-react';

export default function DemoLauncher() {
  const {
    demoScenarios,
    setSimulation,
    setMaintenance,
    setBatteryStatus,
    setComparison,
    setRoutes,
    setActiveScenario,
    isLoading,
    setIsLoading,
    setLoadingMessage,
    setError,
  } = useEVStore();

  const [running, setRunning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleScenario = async (scenarioId: string) => {
    setRunning(scenarioId);
    setIsLoading(true);
    setLoadingMessage(`Running scenario: ${scenarioId}…`);
    setError(null);
    try {
      const res = await runDemoScenario(scenarioId);
      setActiveScenario(res.scenario);
      setSimulation(res.simulation);
      setMaintenance(res.maintenance);
      setBatteryStatus(res.battery_summary);
      setComparison(res.comparison);
      setRoutes({
        shortest: res.route_coords.shortest,
        energy: res.route_coords.energy,
        modified: res.route_coords.modified,
      } as never);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Scenario failed');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      setRunning(null);
    }
  };

  return (
    <div className="glass-card p-4 flex flex-col gap-3 overflow-y-auto scrollbar-none" style={{ minHeight: 0 }}>
      <div className="flex items-center gap-2 mb-1">
        <Rocket size={14} className="text-indigo-400" />
        <h2 className="text-sm font-bold tracking-wider text-slate-200 uppercase">Demo Scenarios</h2>
      </div>

      <div className="flex flex-col gap-2">
        {demoScenarios.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-2">Backend offline – scenarios unavailable</p>
        )}
        {demoScenarios.map((scenario) => (
          <div
            key={scenario.id}
            className="rounded-xl border transition-all duration-300"
            style={{
              background: expandedId === scenario.id ? 'rgba(15, 23, 42, 0.4)' : 'rgba(11, 18, 32, 0.8)',
              borderColor: expandedId === scenario.id ? 'rgba(6, 182, 212, 0.3)' : '#1e293b',
            }}
          >
            {/* Header */}
            <button
              className="w-full text-left flex items-center justify-between p-3 outline-none"
              onClick={() => setExpandedId(expandedId === scenario.id ? null : scenario.id)}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg leading-none">{scenario.icon}</span>
                <span className="text-xs font-semibold text-slate-200 tracking-wide">{scenario.name}</span>
              </div>
              <ChevronDown
                size={13}
                className={`text-slate-500 transition-transform duration-300 ${
                  expandedId === scenario.id ? 'transform rotate-180 text-cyan-400' : ''
                }`}
              />
            </button>

            {/* Collapsible Content */}
            <AnimatePresence initial={false}>
              {expandedId === scenario.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-1 border-t border-slate-900/50 flex flex-col gap-2.5">
                    <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                      {scenario.description}
                    </p>
                    <button
                      className="btn-primary w-full py-1.5 px-3 flex items-center justify-center gap-1.5 text-xs font-semibold"
                      onClick={() => handleScenario(scenario.id)}
                      disabled={isLoading}
                    >
                      {running === scenario.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Play size={10} className="fill-current text-white" />
                      )}
                      <span>Run Scenario</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}


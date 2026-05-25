'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEVStore } from '@/state/store';
import { runDemoScenario } from '@/services/api';
import { Rocket, ChevronRight } from 'lucide-react';

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
    <div className="glass-card p-4 flex flex-col gap-3 overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="flex items-center gap-2">
        <Rocket size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Demo Scenarios</h2>
      </div>

      <div className="flex flex-col gap-2">
        {demoScenarios.length === 0 && (
          <p className="text-xs text-slate-500">Backend offline – scenarios unavailable</p>
        )}
        {demoScenarios.map((scenario) => (
          <motion.button
            key={scenario.id}
            className="text-left rounded-xl p-3 transition-all border"
            style={{
              background: running === scenario.id
                ? 'rgba(99,102,241,0.2)'
                : 'rgba(15,23,42,0.6)',
              borderColor: running === scenario.id
                ? 'rgba(99,102,241,0.5)'
                : 'rgba(99,102,241,0.15)',
            }}
            onClick={() => !isLoading && handleScenario(scenario.id)}
            disabled={isLoading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">{scenario.icon}</span>
                <span className="text-xs font-semibold text-slate-200">{scenario.name}</span>
              </div>
              {running === scenario.id ? (
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ChevronRight size={12} className="text-slate-500" />
              )}
            </div>
            <p className="text-xs text-slate-500 leading-tight">{scenario.description}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

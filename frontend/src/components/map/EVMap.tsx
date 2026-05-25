'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEVStore } from '@/state/store';
import { CLUSTER_COLORS } from '../dashboard/Sidebar';
import { motion } from 'framer-motion';

// ── Leaflet icon fix ────────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Custom icons ────────────────────────────────────────────────────────────────
const createIcon = (color: string, size = 28) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border: 3px solid white;
      box-shadow: 0 0 12px ${color}88;
      display:flex; align-items:center; justify-content:center;
      font-size:${size / 2.5}px;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const EV_ICON = L.divIcon({
  className: '',
  html: `<div class="ev-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const SOURCE_ICON = createIcon('#34d399', 32);
const TARGET_ICON  = createIcon('#f87171', 32);
const CHARGER_ICON = createIcon('#fbbf24', 22);

// Route colours
const ROUTE_COLORS: Record<string, string> = {
  shortest: '#38bdf8',
  energy:   '#34d399',
  modified: '#818cf8',
};

// ── Map auto-fit ────────────────────────────────────────────────────────────────
function MapFitter({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      try { map.fitBounds(bounds, { padding: [40, 40] }); }
      catch { /* ignore */ }
    }
  }, [bounds, map]);
  return null;
}

// ── Simulation auto-step ─────────────────────────────────────────────────────────
function SimulationRunner() {
  const { isSimulating, simulationStep, setSimulationStep, simulation, simulationSpeed, setIsSimulating } = useEVStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef(simulationStep);
  stepRef.current = simulationStep;

  useEffect(() => {
    if (!isSimulating || !simulation) return;
    timerRef.current = setInterval(() => {
      const next = stepRef.current + 1;
      if (next >= (simulation?.steps.length ?? 1)) {
        setIsSimulating(false);
      } else {
        setSimulationStep(next);
      }
    }, simulationSpeed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isSimulating, simulationSpeed, simulation]);

  return null;
}

// ── Main Map Component ────────────────────────────────────────────────────────────
export default function EVMap() {
  const {
    graphData,
    stations,
    routes,
    activeAlgorithm,
    simulation,
    simulationStep,
    showClusters,
    showStations,
    sourceNode,
    targetNode,
  } = useEVStore();

  const center: [number, number] = [3.1390, 101.6869]; // KL default
  const activeRoute = routes?.[activeAlgorithm];

  // Compute map bounds from route coords
  const bounds: L.LatLngBoundsExpression | null = (() => {
    if (!activeRoute?.path_coords?.length) return null;
    const coords = activeRoute.path_coords as [number, number][];
    if (coords.length < 2) return null;
    return L.latLngBounds(coords.map(([lat, lon]) => [lat, lon]));
  })();

  // Current EV position
  const currentStep = simulation?.steps[simulationStep];
  const evPos: [number, number] | null = currentStep
    ? [currentStep.lat, currentStep.lon]
    : null;

  // Source / Target nodes
  const sourceNodeData = graphData?.nodes.find((n) => n.id === sourceNode);
  const targetNodeData  = graphData?.nodes.find((n) => n.id === targetNode);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', background: '#0a0f1e' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        />

        <MapFitter bounds={bounds} />
        <SimulationRunner />

        {/* ── Routes ──────────────────────────────────────────────────────── */}
        {routes && Object.entries(routes).map(([alg, route]) => {
          if (!route?.path_coords?.length) return null;
          const isActive = alg === activeAlgorithm;
          return (
            <Polyline
              key={alg}
              positions={route.path_coords as [number, number][]}
              pathOptions={{
                color: ROUTE_COLORS[alg] ?? '#818cf8',
                weight: isActive ? 5 : 2,
                opacity: isActive ? 0.9 : 0.3,
                dashArray: alg === 'shortest' ? '8 4' : alg === 'energy' ? '4 4' : undefined,
              }}
            >
              <Popup>
                <div className="text-xs p-1">
                  <strong style={{ color: ROUTE_COLORS[alg] }}>{alg}</strong><br />
                  Distance: {route.total_distance_km.toFixed(2)} km<br />
                  Energy: {route.total_energy_kwh.toFixed(3)} kWh<br />
                  Time: {route.total_time_min.toFixed(1)} min<br />
                  Feasible: {route.feasible ? '✓' : '✗'}
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* ── Charging Stations ────────────────────────────────────────────── */}
        {showStations && stations.map((station) => (
          <CircleMarker
            key={station.id}
            center={[station.lat, station.lon]}
            radius={showClusters ? 8 : 6}
            pathOptions={{
              color: showClusters ? CLUSTER_COLORS[station.cluster_id % CLUSTER_COLORS.length] : '#fbbf24',
              fillColor: showClusters ? CLUSTER_COLORS[station.cluster_id % CLUSTER_COLORS.length] : '#fbbf24',
              fillOpacity: 0.8,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>
                <strong style={{ color: '#fbbf24' }}>{station.name}</strong><br />
                Type: {station.charger_type}<br />
                Power: {station.power_kw} kW<br />
                Occupancy: {(station.occupancy_rate * 100).toFixed(0)}%<br />
                Wait: {station.wait_time_min} min<br />
                Cluster: {station.cluster_id}<br />
                Desirability: {(station.cluster_desirability * 100).toFixed(0)}%
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* ── Source marker ────────────────────────────────────────────────── */}
        {sourceNodeData && (
          <Marker
            position={[sourceNodeData.lat, sourceNodeData.lon]}
            icon={SOURCE_ICON}
          >
            <Popup>
              <div style={{ fontSize: 11 }}>
                <strong style={{ color: '#34d399' }}>Source</strong><br />
                {sourceNodeData.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* ── Target marker ────────────────────────────────────────────────── */}
        {targetNodeData && (
          <Marker
            position={[targetNodeData.lat, targetNodeData.lon]}
            icon={TARGET_ICON}
          >
            <Popup>
              <div style={{ fontSize: 11 }}>
                <strong style={{ color: '#f87171' }}>Target</strong><br />
                {targetNodeData.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* ── EV vehicle marker ────────────────────────────────────────────── */}
        {evPos && evPos[0] !== 0 && (
          <Marker position={evPos} icon={EV_ICON}>
            <Popup>
              <div style={{ fontSize: 11 }}>
                <strong style={{ color: '#818cf8' }}>EV Position</strong><br />
                SoC: {((currentStep?.soc ?? 0) * 100).toFixed(1)}%<br />
                SoH: {((currentStep?.soh ?? 0) * 100).toFixed(1)}%<br />
                Event: {currentStep?.event}<br />
                {currentStep?.event_detail}
              </div>
            </Popup>
          </Marker>
        )}

        {/* ── Charging stop markers ────────────────────────────────────────── */}
        {activeRoute?.charging_stops?.map((cs, i) => {
          const node = graphData?.nodes.find((n) => n.id === cs.node_id);
          if (!node) return null;
          return (
            <CircleMarker
              key={`cs-${i}`}
              center={[node.lat, node.lon]}
              radius={12}
              pathOptions={{ color: '#34d399', fillColor: '#34d399', fillOpacity: 0.9, weight: 3 }}
            >
              <Popup>
                <div style={{ fontSize: 11 }}>
                  <strong style={{ color: '#34d399' }}>Charging Stop</strong><br />
                  {cs.station_name}<br />
                  SoC: {(cs.soc_before * 100).toFixed(0)}% → {(cs.soc_after * 100).toFixed(0)}%<br />
                  Wait: {cs.wait_time_min} min
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* ── Overlay: Legend ──────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-4 left-4 glass-card-sm p-3 z-[1000]"
        style={{ minWidth: 160 }}
      >
        <p className="text-xs font-bold text-slate-300 mb-2">Route Legend</p>
        {Object.entries(ROUTE_COLORS).map(([alg, color]) => (
          <div key={alg} className="flex items-center gap-2 text-xs mb-1">
            <div className="w-4 h-1 rounded" style={{ background: color }} />
            <span style={{ color: alg === activeAlgorithm ? color : '#64748b' }}>
              {alg === 'shortest' ? 'Shortest Path'
               : alg === 'energy' ? 'Energy-Aware'
               : 'Modified A*'}
            </span>
            {alg === activeAlgorithm && (
              <span className="badge badge-purple" style={{ fontSize: 9, padding: '1px 5px' }}>active</span>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs mt-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#fbbf24' }} />
          <span className="text-slate-400">Charging Station</span>
        </div>
        <div className="flex items-center gap-2 text-xs mt-1">
          <div className="w-3 h-3 rounded-full" style={{ background: '#818cf8', boxShadow: '0 0 6px #818cf8' }} />
          <span className="text-slate-400">EV Vehicle</span>
        </div>
      </div>

      {/* ── Overlay: Event badge ──────────────────────────────────────────────── */}
      {currentStep && (
        <div className="absolute top-4 right-4 z-[1000]">
          <motion.div
            className="glass-card-sm px-3 py-2 text-xs font-semibold"
            key={currentStep.event}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              color: currentStep.event === 'charging' ? '#34d399'
                   : currentStep.event === 'arrived' ? '#818cf8'
                   : '#38bdf8',
            }}
          >
            {currentStep.event === 'travel'   ? '🚗 Travelling'
             : currentStep.event === 'charging' ? '⚡ Charging'
             : currentStep.event === 'arrived'  ? '🏁 Arrived'
             : '⏸ Idle'}
            {currentStep.event_detail && (
              <span className="ml-2 text-slate-400 font-normal">{currentStep.event_detail}</span>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

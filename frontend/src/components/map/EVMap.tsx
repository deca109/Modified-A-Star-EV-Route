'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useEVStore } from '@/state/store';
import { CLUSTER_COLORS } from '../dashboard/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Compass } from 'lucide-react';

const ROUTE_COLORS: Record<string, string> = {
  shortest: '#38bdf8',
  energy:   '#34d399',
  modified: '#818cf8',
};

export default function EVMap() {
  const {
    graphData,
    stations,
    routes,
    activeAlgorithm,
    simulation,
    simulationStep,
    setSimulationStep,
    isSimulating,
    setIsSimulating,
    simulationSpeed,
    showClusters,
    showStations,
    sourceNode,
    targetNode,
    setActiveAlgorithm,
    isMapEnlarged,
    setIsMapEnlarged,
  } = useEVStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeRoute = routes?.[activeAlgorithm];

  // ── Pan and Zoom State ──────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredElement, setHoveredElement] = useState<{
    type: 'node' | 'station' | 'source_target';
    x: number;
    y: number;
    title: string;
    details: React.ReactNode;
  } | null>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ── Simulation Auto-Runner ──────────────────────────────────────────────────
  const stepRef = useRef(simulationStep);
  stepRef.current = simulationStep;

  useEffect(() => {
    if (!isSimulating || !simulation) return;
    const timer = setInterval(() => {
      const next = stepRef.current + 1;
      if (next >= (simulation?.steps.length ?? 1)) {
        setIsSimulating(false);
      } else {
        setSimulationStep(next);
      }
    }, simulationSpeed);
    return () => clearInterval(timer);
  }, [isSimulating, simulationSpeed, simulation, setIsSimulating, setSimulationStep]);

  // ── Coordinate Projection Calculations ──────────────────────────────────────
  const projectedNodes = useMemo(() => {
    if (!graphData?.nodes?.length) return new Map();

    const lats = graphData.nodes.map((n) => n.lat);
    const lons = graphData.nodes.map((n) => n.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const map = new Map();
    graphData.nodes.forEach((n) => {
      const pctX = maxLon === minLon ? 0.5 : (n.lon - minLon) / (maxLon - minLon);
      const pctY = maxLat === minLat ? 0.5 : (n.lat - minLat) / (maxLat - minLat);
      
      // Map to 1000x1000 coordinates with 100px padding
      const padding = 100;
      const x = padding + pctX * (1000 - 2 * padding);
      const y = 1000 - padding - pctY * (1000 - 2 * padding); // Invert Y for SVG coordinates
      map.set(n.id, { x, y, ...n });
    });
    return map;
  }, [graphData]);

  // Source / Target node data
  const sourceNodeData = graphData?.nodes.find((n) => n.id === sourceNode);
  const targetNodeData = graphData?.nodes.find((n) => n.id === targetNode);

  // Get SVG points for a route path
  const getRoutePoints = (routePath: Array<string | number>) => {
    return routePath
      .map((id) => projectedNodes.get(id))
      .filter(Boolean) as Array<{ x: number; y: number }>;
  };

  const getPathD = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return '';
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
  };

  // Current EV simulation vehicle position
  const currentStep = simulation?.steps[simulationStep];
  const evProjectedPos = useMemo(() => {
    if (!currentStep || !graphData?.nodes?.length) return null;
    
    const lats = graphData.nodes.map((n) => n.lat);
    const lons = graphData.nodes.map((n) => n.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const pctX = maxLon === minLon ? 0.5 : (currentStep.lon - minLon) / (maxLon - minLon);
    const pctY = maxLat === minLat ? 0.5 : (currentStep.lat - minLat) / (maxLat - minLat);
    const padding = 100;
    const x = padding + pctX * (1000 - 2 * padding);
    const y = 1000 - padding - pctY * (1000 - 2 * padding);
    return { x, y };
  }, [currentStep, graphData]);

  // ── Auto-fitting Viewport bounding box ──────────────────────────────────────────
  const fitView = () => {
    if (!graphData?.nodes?.length || projectedNodes.size === 0) return;

    // Use active route if planned, otherwise fit the whole graph
    const nodesToFit = (activeRoute?.path?.length && 
      activeRoute.path.map((id) => projectedNodes.get(id)).filter(Boolean) as Array<any>) || 
      Array.from(projectedNodes.values());

    if (!nodesToFit.length) return;

    const xs = nodesToFit.map((n) => n.x);
    const ys = nodesToFit.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    const margin = 120;
    const availableWidth = 1000 - 2 * margin;
    const availableHeight = 1000 - 2 * margin;

    const scaleX = graphWidth > 0 ? availableWidth / graphWidth : 1;
    const scaleY = graphHeight > 0 ? availableHeight / graphHeight : 1;
    const newZoom = Math.max(0.5, Math.min(scaleX, scaleY, 2.5));

    const centerX = minX + graphWidth / 2;
    const centerY = minY + graphHeight / 2;

    setZoom(newZoom);
    setPan({
      x: 500 - centerX * newZoom,
      y: 500 - centerY * newZoom,
    });
  };

  useEffect(() => {
    fitView();
    // Re-trigger fitView after standard page layout transitions settle (300-350ms)
    const timer = setTimeout(fitView, 350);
    return () => clearTimeout(timer);
  }, [activeAlgorithm, routes, graphData, isMapEnlarged]);

  // ── Interactive Drag & Zoom Handlers ─────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = 1.15;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.4, Math.min(10, newZoom)));
  };

  // ── Tooltip trigger handlers ────────────────────────────────────────────────
  const handleNodeHover = (node: any, e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipX = e.clientX - rect.left;
    const tooltipY = e.clientY - rect.top;

    setHoveredElement({
      type: 'node',
      x: tooltipX,
      y: tooltipY,
      title: node.name || `Road Junction ${node.id}`,
      details: (
        <div className="flex flex-col gap-1.5 font-mono text-[10px] mt-2 w-full">
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Node ID</span>
            <span className="text-slate-100 font-bold">{node.id}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Latitude</span>
            <span className="text-cyan-400 font-bold">{node.lat.toFixed(6)}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Longitude</span>
            <span className="text-cyan-400 font-bold">{node.lon.toFixed(6)}</span>
          </div>
          {node.slope !== undefined && node.slope !== 0 && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Slope</span>
              <span className="text-amber-400 font-bold">{node.slope.toFixed(2)}%</span>
            </div>
          )}
        </div>
      ),
    });
  };

  const handleStationHover = (station: any, e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipX = e.clientX - rect.left;
    const tooltipY = e.clientY - rect.top;

    setHoveredElement({
      type: 'station',
      x: tooltipX,
      y: tooltipY,
      title: station.name,
      details: (
        <div className="flex flex-col gap-1.5 text-[10px] mt-2 w-full">
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Type</span>
            <span className="text-cyan-400 font-bold">{station.charger_type}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Power</span>
            <span className="text-slate-100 font-bold font-mono">{station.power_kw} kW</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Wait Time</span>
            <span className="text-amber-400 font-bold font-mono">{station.wait_time_min} mins</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-800/40 pb-1">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Occupancy</span>
            <span className="text-slate-100 font-bold font-mono">{(station.occupancy_rate * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium uppercase tracking-wider text-[9px]">Desirability</span>
            <span className="text-green-400 font-bold font-mono">{(station.desirability_score * 100).toFixed(0)}%</span>
          </div>
        </div>
      ),
    });
  };

  const handleSourceTargetHover = (type: string, name: string, e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tooltipX = e.clientX - rect.left;
    const tooltipY = e.clientY - rect.top;

    setHoveredElement({
      type: 'source_target',
      x: tooltipX,
      y: tooltipY,
      title: `${type}: ${name}`,
      details: (
        <div className="flex flex-col gap-1 text-[10px] mt-1 font-mono">
          <div className="text-slate-400 uppercase tracking-wider text-[9px]">Route Endpoint</div>
        </div>
      ),
    });
  };

  const handleNodeMouseLeave = () => {
    setHoveredElement(null);
  };

  // Loading/Empty State
  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full glass-card rounded-2xl">
        <div className="text-center">
          <div className="animate-spin-slow text-6xl mb-4">⚡</div>
          <p className="text-slate-400 text-sm font-medium">Initializing topological grid network…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden rounded-2xl border border-slate-800 bg-[#070b14]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
    >
      {/* ── SVG Grid and Network Layout ────────────────────────────────────────── */}
      <svg className="w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dot-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1" fill="rgba(56, 189, 248, 0.12)" />
          </pattern>
          <style>{`
            @keyframes routeFlow {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: -16; }
            }
            .animate-route-dash {
              stroke-dasharray: 6, 10;
              animation: routeFlow 1s linear infinite;
            }
          `}</style>
        </defs>

        {/* Pattern Background Grid */}
        <rect width="100%" height="100%" fill="url(#dot-grid)" pointerEvents="none" />

        {/* Pan and Zoom Group Wrapper */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          
          {/* 1. Base Graph Edges (Road network links) */}
          <g stroke="rgba(30, 41, 59, 0.6)" strokeWidth={1.5} strokeLinecap="round">
            {graphData.edges.map((edge, idx) => {
              const fromNode = projectedNodes.get(edge.source);
              const toNode = projectedNodes.get(edge.target);
              if (!fromNode || !toNode) return null;
              return (
                <line
                  key={`edge-${idx}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                />
              );
            })}
          </g>

          {/* 2. Routes paths (All planned algorithms) */}
          {routes && Object.entries(routes).map(([alg, route]) => {
            if (!route?.path?.length) return null;
            const points = getRoutePoints(route.path);
            if (points.length < 2) return null;
            const d = getPathD(points);
            const isActive = alg === activeAlgorithm;
            const color = ROUTE_COLORS[alg] ?? '#818cf8';

            return (
              <g key={alg}>
                {/* Glow Filter Underlay for active route */}
                {isActive && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.35}
                    style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                  />
                )}

                {/* Standard Solid Colored Route line */}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 4.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={isActive ? 0.95 : 0.2}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => setActiveAlgorithm(alg as any)}
                />

                {/* Flow dash animation on top of active route */}
                {isActive && (
                  <path
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.7}
                    className="animate-route-dash"
                  />
                )}
              </g>
            );
          })}

          {/* 3. Base Graph Nodes (Road Intersections) */}
          <g className="pointer-events-auto">
            {graphData.nodes.map((node) => {
              const isSource = node.id === sourceNode;
              const isTarget = node.id === targetNode;
              const isStation = stations.some((s) => s.node_id === node.id);
              const isActiveRouteNode = activeRoute?.path?.includes(node.id);

              // Stations and selection targets are rendered in their own priority layers
              if (isSource || isTarget || isStation) return null;

              const coord = projectedNodes.get(node.id);
              if (!coord) return null;

              return (
                <g
                  key={`node-${node.id}`}
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleNodeHover(node, e)}
                  onMouseMove={(e) => handleNodeHover(node, e)}
                  onMouseLeave={handleNodeMouseLeave}
                >
                  {/* Invisible hit target to prevent flickering */}
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={8}
                    fill="transparent"
                    stroke="transparent"
                  />
                  {/* Visible small circle */}
                  <circle
                    cx={coord.x}
                    cy={coord.y}
                    r={isActiveRouteNode ? 4 : 2.5}
                    fill={isActiveRouteNode ? '#818cf8' : '#0f172a'}
                    stroke={isActiveRouteNode ? '#ffffff' : '#334155'}
                    strokeWidth={isActiveRouteNode ? 1.5 : 1}
                    className="transition-all duration-150 pointer-events-none"
                  />
                </g>
              );
            })}
          </g>

          {/* 4. Charging Stations Layer */}
          {showStations && (
            <g className="pointer-events-auto">
              {stations.map((station) => {
                const node = projectedNodes.get(station.node_id);
                if (!node) return null;

                const clusterColor = showClusters
                  ? CLUSTER_COLORS[station.cluster_id % CLUSTER_COLORS.length]
                  : '#fbbf24';
                const isActiveStop = activeRoute?.charging_stops?.some(
                  (cs) => cs.node_id === station.node_id
                );

                return (
                  <g
                    key={station.id}
                    onMouseEnter={(e) => handleStationHover(station, e)}
                    onMouseMove={(e) => handleStationHover(station, e)}
                    onMouseLeave={handleNodeMouseLeave}
                  >
                    {/* Pulsing glow ring for active stop stations */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isActiveStop ? 11 : 8}
                      fill="none"
                      stroke={clusterColor}
                      strokeWidth={isActiveStop ? 2.5 : 1.5}
                      opacity={0.8}
                      className={isActiveStop ? 'animate-pulse' : ''}
                    />
                    {/* Inner core */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={3.5}
                      fill={clusterColor}
                      stroke="#070b14"
                      strokeWidth={1}
                    />
                    {/* Charging station border outline */}
                    {isActiveStop && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={14}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth={1}
                        strokeDasharray="2,2"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* 5. Source Node Priority Marker (Green target) */}
          {sourceNodeData && (() => {
            const coord = projectedNodes.get(sourceNodeData.id);
            if (!coord) return null;
            return (
              <g
                className="pointer-events-auto"
                onMouseEnter={(e) => handleSourceTargetHover('Source', sourceNodeData.name, e)}
                onMouseMove={(e) => handleSourceTargetHover('Source', sourceNodeData.name, e)}
                onMouseLeave={handleNodeMouseLeave}
              >
                <circle cx={coord.x} cy={coord.y} r={9} fill="none" stroke="#34d399" strokeWidth={2} />
                <circle cx={coord.x} cy={coord.y} r={3.5} fill="#34d399" />
                <line x1={coord.x - 13} y1={coord.y} x2={coord.x + 13} y2={coord.y} stroke="#34d399" strokeWidth={1} />
                <line x1={coord.x} y1={coord.y - 13} x2={coord.x} y2={coord.y + 13} stroke="#34d399" strokeWidth={1} />
              </g>
            );
          })()}

          {/* 6. Target Node Priority Marker (Red target) */}
          {targetNodeData && (() => {
            const coord = projectedNodes.get(targetNodeData.id);
            if (!coord) return null;
            return (
              <g
                className="pointer-events-auto"
                onMouseEnter={(e) => handleSourceTargetHover('Target', targetNodeData.name, e)}
                onMouseMove={(e) => handleSourceTargetHover('Target', targetNodeData.name, e)}
                onMouseLeave={handleNodeMouseLeave}
              >
                <circle cx={coord.x} cy={coord.y} r={9} fill="none" stroke="#f87171" strokeWidth={2} />
                <circle cx={coord.x} cy={coord.y} r={3.5} fill="#f87171" />
                <line x1={coord.x - 13} y1={coord.y} x2={coord.x + 13} y2={coord.y} stroke="#f87171" strokeWidth={1} />
                <line x1={coord.x} y1={coord.y - 13} x2={coord.x} y2={coord.y + 13} stroke="#f87171" strokeWidth={1} />
              </g>
            );
          })()}

          {/* 7. EV Vehicle Simulator Dot Layer */}
          {evProjectedPos && evProjectedPos.x !== 0 && (
            <g>
              <circle
                cx={evProjectedPos.x}
                cy={evProjectedPos.y}
                r={13}
                fill="none"
                stroke="#818cf8"
                strokeWidth={1}
                opacity={0.3}
                className="animate-ping"
              />
              <circle
                cx={evProjectedPos.x}
                cy={evProjectedPos.y}
                r={6.5}
                fill="#818cf8"
                stroke="#ffffff"
                strokeWidth={2}
                style={{ filter: 'drop-shadow(0 0 3px #818cf8)' }}
              />
            </g>
          )}

        </g>
      </svg>

      {/* ── Floating Controls Overlay ─────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 z-[999] flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => setZoom((z) => Math.min(10, z * 1.25))}
          className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all shadow-md active:scale-95"
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z / 1.25))}
          className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all shadow-md active:scale-95"
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>
        <button
          onClick={fitView}
          className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all shadow-md active:scale-95"
          title="Reset Fit View"
        >
          <Compass size={15} />
        </button>
        <button
          onClick={() => setIsMapEnlarged(!isMapEnlarged)}
          className="w-8 h-8 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/30 flex items-center justify-center transition-all shadow-md active:scale-95"
          title={isMapEnlarged ? "Exit Fullscreen" : "Enlarge Map"}
        >
          {isMapEnlarged ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* ── Overlay: Topological Legend ───────────────────────────────────────── */}
      <div
        className="absolute bottom-5 left-4 z-[999] rounded-2xl border"
        style={{
          background: 'rgba(7, 11, 20, 0.88)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(30, 41, 59, 0.8)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          minWidth: 170,
          padding: '14px 16px',
        }}
      >
        <p className="text-[10px] font-bold text-slate-300 mb-3 uppercase tracking-widest">Grid Legend</p>
        <div className="flex flex-col gap-2">
          {Object.entries(ROUTE_COLORS).map(([alg, color]) => (
            <div key={alg} className="flex items-center gap-2.5 text-xs">
              <div className="w-5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
              <span
                className="font-medium capitalize"
                style={{ color: alg === activeAlgorithm ? color : '#64748b' }}
              >
                {alg === 'shortest' ? 'Shortest Path'
                 : alg === 'energy' ? 'Energy-Aware'
                 : 'Modified A*'}
              </span>
              {alg === activeAlgorithm && (
                <span className="badge badge-purple" style={{ fontSize: 9, padding: '1px 6px' }}>active</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full border border-amber-400 bg-amber-400/20" />
            <span className="text-slate-400">Charging Station</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-indigo-400 border border-white" />
            <span className="text-slate-400">EV Simulator</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-0.5 bg-slate-700" />
            <span className="text-slate-400">Road Connection</span>
          </div>
        </div>
      </div>

      {/* ── Overlay: Event Badge ──────────────────────────────────────────────── */}
      {currentStep && (
        <div className="absolute top-4 right-4 z-[999]">
          <motion.div
            className="px-4 py-2.5 text-xs font-bold rounded-2xl border"
            key={currentStep.event}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(7, 11, 20, 0.9)',
              backdropFilter: 'blur(12px)',
              borderColor: 'rgba(30, 41, 59, 0.8)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
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

      {/* ── Hover Interactive Tooltip ────────────────────────────────────────── */}
      <AnimatePresence>
        {hoveredElement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-[1001] pointer-events-none rounded-xl border border-slate-800 p-3 text-xs w-[190px] space-y-1.5"
            style={{
              left: hoveredElement.x + 16,
              top: hoveredElement.y + 16,
              background: 'rgba(7, 11, 20, 0.92)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
              color: '#f1f5f9',
            }}
          >
            <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 truncate">
              {hoveredElement.title}
            </div>
            {hoveredElement.details}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

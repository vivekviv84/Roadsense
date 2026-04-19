import React, { useState } from 'react'
import type { RefObject } from 'react'
import { DrivingScene3D } from '../DrivingScene3D'
import type { LaneKey } from '../../lib/traffic/config'
import { Map as MapIcon, ShieldAlert } from 'lucide-react'
import type {
  CollisionBundle,
  CorrectionRoutePayload,
  FalsePositiveAnalysis,
  OsmCheck,
  RoadIntelligence,
  RoadWarning,
  RoadWorksStatus,
  WrongWayPayload,
} from '../../types/safety'

type DetectorStatus = {
  sim_running: boolean
  current_scenario: number
  consensus_enabled: boolean
  vehicle_count: number
  alert_count: number
  frontend_vehicle_count: number
  frontend_nearby_count: number
  frontend_same_direction_nearby: number
  frontend_opposite_direction_nearby: number
  closest_vehicle_id: string | null
  closest_distance_m: number | null
}

type DetectorVehicle = {
  vehicle_id: string
  suspicion_active: boolean
}

type DetectorAlert = {
  alert_id: string
  vehicle_id: string
  confidence: number
  heading_deviation: number
  attack_class: string
  alert_type: string
  vehicles_at_risk: Array<{
    vehicle_id: string
    estimated_ttc_sec: number
    closing_speed_kmh: number
  }>
}

type DetectorScenario = { id: number; name: string; description: string }

export type DashboardLayoutProps = {
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  mapContainerRef: RefObject<HTMLDivElement | null>
  wrongWayApi: WrongWayPayload
  isWrongLane: boolean
  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  drivingEnabled: boolean
  setDrivingEnabled: (v: boolean | ((b: boolean) => boolean)) => void
  setLaneOffset: (v: number | ((n: number) => number)) => void
  spawnRandom: () => void
  fromQuery: string
  setFromQuery: (s: string) => void
  toQuery: string
  setToQuery: (s: string) => void
  routeLoading: boolean
  planRoute: () => void
  routeErr: string | null
  activeRouteLabel: string
  nextRouteStepInstruction: string | null
  turnHint: string
  remainingKm: number
  remainingMeters: number
  routeSummaryTrip: string
  routeSummaryEta: string
  routeSummaryLeft: string
  isWrongLaneHud: boolean
  egoLane: LaneKey
  vehiclesLength: number
  frontendNearby: number
  speedKmh: number
  laneOffset: number
  carT: number
  vehicles: Parameters<typeof DrivingScene3D>[0]['vehicles']
  routeCurvature: number
  carScreenLane: LaneKey
  collisionBundle: CollisionBundle | null
  roadIntelligence: RoadIntelligence | null
  roadWarning: RoadWarning
  osmCheck: OsmCheck
  roadWorks: RoadWorksStatus
  falsePositiveAnalysis: FalsePositiveAnalysis
  safetyTimeSlot: number
  correctionPlan: CorrectionRoutePayload | null
  wrongWayCombined: boolean
  telemetry: {
    speedKmh: number
    bearing: number
    lane: string
    drivingEnabled: boolean
    remainingLabel: string
    etaLabel: string
  }
  online: boolean
  lastSyncTime: number | null
  predictedHeading: number | null
  activeRouteForStatus: string
  wsConnected: boolean
  detectorHealth: 'checking' | 'online' | 'offline'
  detectorStatus: DetectorStatus
  detectorError: string | null
  detectorBusy: boolean
  refreshDetectorStatus: () => void
  toggleDetectorConsensus: () => void
  stopDetectorScenario: () => void
  simTick: number
  simTimeSec: number
  detectorScenarios: DetectorScenario[]
  startDetectorScenario: (id: number) => void
  activeAlerts: DetectorAlert[]
  detectorVehicles: DetectorVehicle[]
  recentAlerts: DetectorAlert[]
  requestCurrentLocation: () => void
  trafficDensity: string
  onInjectIntruder: () => void
  intruderInjectTick: number
  onIntruderNear: () => void
  onStartRoadWorks: () => void
  onClearRoadWorks: () => void
  hasActiveRoadWorks: boolean
  diversionInjectTick: number
  diversionClearTick: number
  gpsAccuracyM: number
}

import { Navbar, type TabKey } from './Navbar'
import { DashboardView } from './DashboardView'
import { NavigationView } from './NavigationView'
import { SafetyView } from './SafetyView'
import { IntelView } from './IntelView'

export function DashboardLayout(p: DashboardLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('drive')

  const mapNode = (
    <div className="relative h-full w-full overflow-hidden" ref={p.mapContainerRef} />
  )

  const threeNode = (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      <DrivingScene3D
        speedKmh={p.speedKmh}
        laneOffset={p.laneOffset}
        drivingEnabled={p.drivingEnabled}
        wrongLane={p.isWrongLaneHud}
        egoT={p.carT}
        vehicles={p.vehicles}
        routeCurvature={p.routeCurvature}
        intruderInjectTick={p.intruderInjectTick}
        onIntruderNear={p.onIntruderNear}
        diversionInjectTick={p.diversionInjectTick}
        diversionClearTick={p.diversionClearTick}
      />

      {/* ── WRONG-WAY BANNER (top-centre, blinking) ── */}
      {p.wrongWayCombined && (
        <div
          className="absolute top-4 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
          style={{ animation: 'rs-ww-blink 0.75s ease-in-out infinite' }}
        >
          <style>{`
            @keyframes rs-ww-blink {
              0%,100% { opacity:1; transform:translateX(-50%) scale(1); }
              50%      { opacity:0.6; transform:translateX(-50%) scale(0.97); }
            }
          `}</style>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 28px', borderRadius: '14px',
              border: '2.5px solid #ef4444',
              background: 'rgba(127,29,29,0.88)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 0 32px rgba(239,68,68,0.55), 0 4px 16px rgba(0,0,0,0.6)',
            }}
          >
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
            <span
              style={{
                fontSize: p.wrongWayApi.reason === 'INTRUDER_DETECTED' ? '1.15rem' : '1.5rem',
                fontWeight: 900, letterSpacing: '0.1em',
                color: '#fca5a5', textTransform: 'uppercase',
                fontFamily: 'Inter, system-ui, sans-serif',
                textShadow: '0 0 16px rgba(239,68,68,0.8)',
              }}
            >
              {p.wrongWayApi.reason === 'INTRUDER_DETECTED'
                ? 'WRONG-WAY VEHICLE DETECTED AHEAD'
                : 'WRONG WAY'}
            </span>
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
          </div>
        </div>
      )}

      {/* ── ROAD WORKS BANNER (amber, below wrong-way banner) ── */}
      {p.roadWorks.active && (
        <div
          className="absolute top-20 left-1/2 z-20 -translate-x-1/2 pointer-events-none"
          style={{ animation: 'rs-ww-blink 1.2s ease-in-out infinite' }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 22px', borderRadius: '12px',
              border: '2px solid #d97706',
              background: 'rgba(92,46,0,0.88)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 0 24px rgba(217,119,6,0.45)',
            }}
          >
            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🚧</span>
            <span style={{
              fontSize: '1rem', fontWeight: 800, letterSpacing: '0.1em',
              color: '#fcd34d', textTransform: 'uppercase',
              fontFamily: 'Inter, system-ui, sans-serif',
              textShadow: '0 0 12px rgba(253,211,77,0.7)',
            }}>
              ROAD WORKS AHEAD — EXPECT OPPOSITE TRAFFIC
            </span>
            <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🚧</span>
          </div>
        </div>
      )}

      {/* ── Speed + Lane HUD (top-left) ── */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-4xl font-light text-white drop-shadow-xl tabular-nums">
          {Math.round(p.speedKmh)}{' '}
          <span className="text-sm text-slate-400">km/h</span>
        </div>
        <div className="text-xs text-blue-400 font-medium uppercase tracking-wider">{p.egoLane} lane</div>
        <div
          className="mt-1 text-[10px] font-medium uppercase tracking-widest"
          style={{ color: p.trafficDensity === 'high' ? '#f87171' : p.trafficDensity === 'medium' ? '#fbbf24' : '#4ade80' }}
        >
          {p.trafficDensity} traffic
        </div>
      </div>
    </div>
  )

  const routePlannerNode = (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <MapIcon className="h-4 w-4 text-blue-400" />
        Route planner
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <label className="text-[11px] text-slate-500 flex-1">
            From
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
              value={p.fromQuery}
              onChange={(e) => p.setFromQuery(e.target.value)}
              placeholder="e.g. MG Road"
              disabled={p.routeLoading}
            />
          </label>
          <button 
            type="button" 
            onClick={p.requestCurrentLocation}
            className="rounded-xl border border-white/10 bg-black/20 p-2 text-blue-400 hover:bg-black/40 hover:text-blue-300 transition-colors"
            title="Use Current Location"
          >
            🧭
          </button>
        </div>
        <label className="text-[11px] text-slate-500">
          To
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
            value={p.toQuery}
            onChange={(e) => p.setToQuery(e.target.value)}
            placeholder="e.g. Whitefield"
            disabled={p.routeLoading}
          />
        </label>
        <button
          type="button"
          disabled={p.routeLoading}
          onClick={() => p.planRoute()}
          className="mt-1 rounded-xl border border-blue-500/40 bg-blue-600/25 py-2.5 text-sm font-semibold text-white hover:bg-blue-600/35 disabled:opacity-60"
        >
          {p.routeLoading ? 'Routing…' : 'Plan route'}
        </button>
      </div>
      {p.routeErr && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {p.routeErr}
        </div>
      )}
      <div className="mt-4 flex gap-3 border-t border-white/10 pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-lg text-slate-500">
          /
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{p.activeRouteLabel}</div>
          <div className="mt-1 text-xs text-slate-400">
            {p.nextRouteStepInstruction ?? p.turnHint}
            {' · '}
            {p.remainingKm >= 1 ? `${p.remainingKm.toFixed(1)} km` : `${Math.round(p.remainingMeters)} m`} left
          </div>
          <div className="mt-1 text-[11px] text-blue-300/90">
            {p.routeSummaryTrip} · {p.routeSummaryEta} · left {p.routeSummaryLeft}
          </div>
        </div>
      </div>
      {p.roadWarning && p.roadWarning.active && (
         <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="font-semibold mb-0.5">Road Warning</div>
            <div>{p.roadWarning.reason}</div>
         </div>
      )}
    </div>
  )

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black text-white">
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: activeTab === 'drive' ? 1 : 0, pointerEvents: activeTab === 'drive' ? 'auto' : 'none', zIndex: 10 }}
      >
        <DashboardView />
      </div>

      <div 
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: activeTab === 'route' ? 1 : 0, pointerEvents: activeTab === 'route' ? 'auto' : 'none', zIndex: 10 }}
      >
        <NavigationView mapNode={mapNode} threeNode={threeNode} routePlannerNode={routePlannerNode} />
      </div>

      <div 
        className="absolute inset-0 transition-opacity duration-300 bg-[#050505] overflow-y-auto overflow-x-hidden"
        style={{ opacity: activeTab === 'safety' ? 1 : 0, pointerEvents: activeTab === 'safety' ? 'auto' : 'none', zIndex: 10 }}
      >
        <SafetyView p={p} />
      </div>

      <div 
        className="absolute inset-0 transition-opacity duration-300 bg-[#050505] overflow-y-auto overflow-x-hidden"
        style={{ opacity: activeTab === 'intel' ? 1 : 0, pointerEvents: activeTab === 'intel' ? 'auto' : 'none', zIndex: 10 }}
      >
        <IntelView p={p} />
      </div>

      <Navbar activeTab={activeTab} onSelect={setActiveTab} />
    </div>
  )
}

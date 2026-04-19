import { useState } from 'react'
import { CarFront, Gauge, Map as MapIcon, Moon, Navigation2, ShieldAlert, Siren, Sun } from 'lucide-react'
import type { RefObject } from 'react'
import { CorrectionRoutePanel } from './components/CorrectionRoutePanel'
import { DrivingScene3D } from './components/DrivingScene3D'
import { LiveStatusBar } from './components/LiveStatusBar'
import { NearbyDangerRadar } from './components/NearbyDangerRadar'
import { OfflineModeBadge } from './components/OfflineModeBadge'
import { RoadConfidenceCard } from './components/RoadConfidenceCard'
import { Sidebar } from './components/Sidebar'
import { TelemetryPanel } from './components/TelemetryPanel'
import { WrongWayAlert } from './components/WrongWayAlert'
import type { LaneKey } from './lib/traffic/config'
import type {
  CollisionBundle,
  CorrectionRoutePayload,
  RoadIntelligence,
  RoadWarning,
  WrongWayPayload,
} from './types/safety'

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

type Props = {
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
  trafficDensity: string
  requestCurrentLocation?: () => void
}

import type { TabKey } from './components/TopNavbar'
import { TopNavbar } from './components/TopNavbar'
import { DashboardHomeView } from './components/views/DashboardHomeView'
import { NavigationView } from './components/views/NavigationView'
import { InfoView } from './components/views/InfoView'

export function AppDashboardShell(p: Props) {
  const [mapVisible, setMapVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')

  const shell =
    p.theme === 'dark'
      ? 'dark bg-[#05070a] text-slate-100'
      : 'bg-slate-100 text-slate-900'

  /* ── Route planner content (passed to Sidebar → Route tab) ── */
  const routePlannerContent = (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <MapIcon className="h-4 w-4 text-blue-400" />
        Route planner
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-[11px] text-slate-500">
          From
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
            value={p.fromQuery}
            onChange={(e) => p.setFromQuery(e.target.value)}
            placeholder="e.g. MG Road"
            disabled={p.routeLoading}
          />
        </label>
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
      {p.routeErr ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {p.routeErr}
        </div>
      ) : null}
      <div className="mt-4 flex gap-3 border-t border-white/10 pt-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-lg text-slate-500">
          /
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{p.activeRouteLabel}</div>
          <div className="mt-1 text-xs text-slate-400">
            {p.nextRouteStepInstruction ?? p.turnHint}
            {' · '}
            {p.remainingKm >= 1
              ? `${p.remainingKm.toFixed(1)} km`
              : `${Math.round(p.remainingMeters)} m`}{' '}
            left
          </div>
          <div className="mt-1 text-[11px] text-blue-300/90">
            {p.routeSummaryTrip} · {p.routeSummaryEta} · left {p.routeSummaryLeft}
          </div>
        </div>
      </div>
    </div>
  )

  /* ── Offline status content (Drive tab) ── */
  const statusContent = (
    <div className="space-y-2">
      <OfflineModeBadge
        offline={!p.online}
        lastSync={p.lastSyncTime}
        predictedHeading={p.predictedHeading}
      />
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
        Cached routes + sync for offline dead-reckoning. Backend:{' '}
        <span className="text-slate-300">{p.detectorHealth}</span>
      </div>
    </div>
  )

  /* ── Safety tab content ── */
  const safetyContent = (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-blue-400" />
        Safety Status
      </div>

      {/* Wrong way alert indicator */}
      <div
        className={`rounded-xl border px-3 py-2 text-xs font-medium ${
          p.wrongWayCombined
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : 'border-green-500/30 bg-green-500/10 text-green-200'
        }`}
      >
        {p.wrongWayCombined ? '⚠ Wrong-way detected' : '✓ Lane flow OK'}
      </div>

      {/* Road warning */}
      {p.roadWarning && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${
          p.roadWarning.active
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
            : 'border-white/10 bg-white/5 text-slate-400'
        }`}>
          <div className="font-semibold mb-0.5">Road Warning</div>
          <div>{p.roadWarning.reason}</div>
        </div>
      )}

      {/* Nearby danger radar */}
      <NearbyDangerRadar bundle={p.collisionBundle} wrongWayActive={p.wrongWayCombined} />

      {/* Correction route */}
      <CorrectionRoutePanel plan={p.correctionPlan} visible={p.wrongWayCombined && !!p.correctionPlan} />

      {/* Wrong way API detail */}
      {p.wrongWayApi.active && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-3 text-xs space-y-1">
          <div className="font-semibold text-red-300">Wrong Way API Data</div>
          <div className="text-slate-400">Heading: {p.wrongWayApi.current_heading?.toFixed(0)}° expected {p.wrongWayApi.expected_heading?.toFixed(0)}°</div>
          <div className="text-slate-400">Confidence: {(p.wrongWayApi.confidence * 100).toFixed(0)}%</div>
          <div className="text-slate-400">Reason: {p.wrongWayApi.reason}</div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400 leading-relaxed">
        Start a detector scenario in the right panel to stream live safety events.
      </div>
    </div>
  )

  /* ── Intel tab content ── */
  const intelContent = (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Road Intelligence
      </div>

      {p.roadIntelligence ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs space-y-2">
            <div className="font-semibold text-slate-300">Current Segment Analysis</div>
            {Object.entries(p.roadIntelligence).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="text-slate-200 font-mono text-[11px]">
                  {typeof val === 'number' ? val.toFixed(2) : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400 leading-relaxed">
          Road intelligence history populates as you drive routes and the backend collects traffic flow data.
        </div>
      )}

      {/* RoadConfidenceCard inline */}
      <RoadConfidenceCard
        intel={p.roadIntelligence}
        warning={p.roadWarning}
        timeSlot={p.safetyTimeSlot}
      />

      {/* Recent events */}
      {p.recentAlerts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Recent Events
          </div>
          {p.recentAlerts.slice(0, 4).map((alert) => (
            <div
              key={alert.alert_id}
              className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs"
            >
              <div className="flex justify-between">
                <span className="font-semibold text-slate-200">{alert.vehicle_id}</span>
                <span className="text-slate-500">{alert.attack_class}</span>
              </div>
              <div className="text-slate-500 mt-0.5">{alert.alert_type} · conf {alert.confidence.toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  /* ── Simulator API panel (right column) ── */
  const simulatorPanel = (
    <div className="rs-panel rs-detect rounded-2xl border border-white/10">
      <div className="rs-panel-title flex items-center gap-2">
        <ShieldAlert size={16} /> Simulator API
      </div>
      <div className="rs-detect-body">
        <div className="rs-detect-status">
          <div className={`rs-status-pill is-${p.detectorHealth}`}>
            {p.detectorHealth === 'online'
              ? p.wsConnected
                ? 'Backend + stream live'
                : 'Backend online | stream reconnecting'
              : p.detectorHealth === 'checking'
                ? 'Checking backend...'
                : 'Backend offline'}
          </div>
          <div className="rs-detect-sub">
            Scenario {p.detectorStatus.current_scenario} | Tick {p.simTick} | T+ {p.simTimeSec.toFixed(1)}s
          </div>
        </div>

        <div className="rs-detect-actions">
          <button
            type="button"
            className="rs-mini-btn"
            onClick={() => p.refreshDetectorStatus()}
            disabled={p.detectorBusy}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rs-mini-btn"
            onClick={() => p.toggleDetectorConsensus()}
            disabled={p.detectorBusy || p.detectorHealth === 'offline'}
          >
            Consensus {p.detectorStatus.consensus_enabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className="rs-mini-btn is-danger"
            onClick={() => p.stopDetectorScenario()}
            disabled={p.detectorBusy || !p.detectorStatus.sim_running}
          >
            Stop
          </button>
        </div>

        {p.detectorError ? <div className="rs-route-err">{p.detectorError}</div> : null}

        <div className="rs-detect-grid">
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Sim</div>
            <div className="rs-detect-v">{p.detectorStatus.sim_running ? 'RUNNING' : 'IDLE'}</div>
          </div>
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Vehicles</div>
            <div className="rs-detect-v">{p.detectorStatus.vehicle_count}</div>
          </div>
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Active alerts</div>
            <div className="rs-detect-v">{p.activeAlerts.length}</div>
          </div>
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Suspicious</div>
            <div className="rs-detect-v">
              {p.detectorVehicles.filter((vehicle) => vehicle.suspicion_active).length}
            </div>
          </div>
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Road traffic</div>
            <div className="rs-detect-v">{p.detectorStatus.frontend_vehicle_count}</div>
          </div>
          <div className="rs-detect-metric">
            <div className="rs-detect-k">Nearby ego</div>
            <div className="rs-detect-v">{p.detectorStatus.frontend_nearby_count}</div>
          </div>
        </div>

        <div className="rs-note">
          Bridge: same {p.detectorStatus.frontend_same_direction_nearby} · opposite{' '}
          {p.detectorStatus.frontend_opposite_direction_nearby}
          {p.detectorStatus.closest_vehicle_id && p.detectorStatus.closest_distance_m != null
            ? ` · closest ${p.detectorStatus.closest_vehicle_id} @ ${Math.round(p.detectorStatus.closest_distance_m)} m`
            : ''}
        </div>

        <div className="rs-detect-section">
          <div className="rs-detect-head">Scenarios</div>
          <div className="rs-scenarios">
            {p.detectorScenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`rs-scenario ${p.detectorStatus.current_scenario === scenario.id ? 'is-active' : ''}`}
                onClick={() => p.startDetectorScenario(scenario.id)}
                disabled={p.detectorBusy || p.detectorHealth === 'offline'}
              >
                <div className="rs-scenario-name">
                  {scenario.id}. {scenario.name}
                </div>
                <div className="rs-scenario-desc">{scenario.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rs-detect-section">
          <div className="rs-detect-head">Active alerts</div>
          {p.activeAlerts.length === 0 ? (
            <div className="rs-detect-empty">No active wrong-way alerts right now.</div>
          ) : (
            <div className="rs-alert-list">
              {p.activeAlerts.slice(0, 4).map((alert) => {
                const nearestRisk = alert.vehicles_at_risk[0]
                return (
                  <div className="rs-alert-card" key={alert.alert_id}>
                    <div className="rs-alert-card-top">
                      <div>
                        <div className="rs-alert-id">{alert.vehicle_id}</div>
                        <div className="rs-alert-class">{alert.attack_class}</div>
                      </div>
                      <div className={`rs-badge ${alert.alert_type === 'confirmed' ? 'is-danger' : ''}`}>
                        {alert.alert_type}
                      </div>
                    </div>
                    <div className="rs-alert-meta">
                      Confidence {alert.confidence.toFixed(1)} | Deviation{' '}
                      {alert.heading_deviation.toFixed(0)}°
                    </div>
                    <div className="rs-alert-meta">
                      {nearestRisk
                        ? `At risk ${nearestRisk.vehicle_id} | TTC ${nearestRisk.estimated_ttc_sec.toFixed(1)}s | Closing ${nearestRisk.closing_speed_kmh.toFixed(1)} km/h`
                        : 'No immediate at-risk vehicles'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rs-detect-section">
          <div className="rs-detect-head">Recent detector events</div>
          {p.recentAlerts.length === 0 ? (
            <div className="rs-detect-empty">Start a scenario to stream detector events here.</div>
          ) : (
            <div className="rs-event-list">
              {p.recentAlerts.slice(0, 5).map((alert) => (
                <div className="rs-event-row" key={alert.alert_id}>
                  <span>{alert.vehicle_id}</span>
                  <span>{alert.alert_type}</span>
                  <span>{alert.attack_class}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const tabClasses = (tab: TabKey) =>
    `absolute inset-0 transition-opacity duration-300 ${
      activeTab === tab ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
    }`

  const threeNode = (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* HUD strip */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-4 py-2">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
            p.isWrongLaneHud
              ? 'border-red-500/50 bg-red-500/15 text-red-100'
              : 'border-blue-500/35 bg-blue-500/10 text-slate-100'
          }`}
        >
          {p.isWrongLaneHud ? <Siren className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {p.isWrongLaneHud ? 'Wrong-way pattern detected' : 'Lane flow OK'}
        </div>
        <div className="flex gap-2">
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-[11px] text-slate-300">
            Lane: {p.egoLane}
          </span>
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-[11px] text-slate-300">
            Traffic: {p.vehiclesLength}
          </span>
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 text-[11px] text-slate-300">
            Nearby: {p.frontendNearby}
          </span>
        </div>
      </div>

      <div
        className={p.isWrongLaneHud ? 'is-wrong' : ''}
        style={{ position: 'relative', flex: '1 1 0%', overflow: 'hidden' }}
      >
        <DrivingScene3D
          speedKmh={p.speedKmh}
          laneOffset={p.laneOffset}
          drivingEnabled={p.drivingEnabled}
          wrongLane={p.isWrongLaneHud}
          egoT={p.carT}
          vehicles={p.vehicles}
          routeCurvature={p.routeCurvature}
        />
        {/* Speed readout overlay */}
        <div className="pointer-events-none absolute bottom-4 right-4 text-right" style={{ zIndex: 10 }}>
          <div className="text-5xl font-bold tabular-nums text-white drop-shadow-lg">
            {Math.round(p.speedKmh)}
          </div>
          <div className="text-xs text-slate-400">km/h</div>
        </div>
        {/* Keyboard hint */}
        <div className="pointer-events-none absolute bottom-4 left-4 text-[10px] text-slate-600" style={{ zIndex: 10 }}>
          ↑↓ Speed · ←→ Lane · Space Pause · R Recenter
        </div>
      </div>
    </div>
  )

  const mapNode = (
    <div className="relative h-full w-full overflow-hidden" ref={p.mapContainerRef} />
  )

  const telemetryPanel = (
    <TelemetryPanel
      speedKmh={p.telemetry.speedKmh}
      bearing={p.telemetry.bearing}
      lane={p.telemetry.lane}
      drivingEnabled={p.telemetry.drivingEnabled}
      remainingLabel={p.telemetry.remainingLabel}
      etaLabel={p.telemetry.etaLabel}
    />
  )

  return (
    <div className={`relative flex min-h-[100dvh] flex-col overflow-hidden ${shell}`}>
      <WrongWayAlert
        apiWrongWay={p.wrongWayApi}
        localWrongLane={p.isWrongLane}
        soundEnabled={p.soundEnabled}
        onSoundToggle={() => p.setSoundEnabled(!p.soundEnabled)}
      />

      <TopNavbar activeTab={activeTab} onSelect={setActiveTab} />

      <div className="relative flex-1 dark:bg-slate-900 bg-slate-50 transition-colors duration-500">
        {/* TAB 1: Dashboard */}
        <div className={tabClasses('dashboard')}>
          <DashboardHomeView />
        </div>

        {/* TAB 2: Navigation */}
        <div className={tabClasses('navigation')}>
          <NavigationView
            routePlannerNode={routePlannerContent}
            mapNode={mapNode}
            threeNode={threeNode}
          />
        </div>

        {/* TAB 3: Information */}
        <div className={tabClasses('info')}>
          <InfoView
            telemetryNode={telemetryPanel}
            radarNode={intelContent}
            alertsNode={
              <div className="flex flex-col gap-3">
                <div className="rounded border border-blue-500/20 bg-blue-500/10 p-2 text-xs text-blue-200">
                  <span className="font-bold">Traffic Density</span>: {p.trafficDensity.toUpperCase()}
                </div>
                {p.activeAlerts.length === 0 ? (
                  <div className="text-slate-500 text-xs">No active alerts...</div>
                ) : (
                  p.activeAlerts.map((alert) => (
                    <div key={alert.alert_id} className="text-xs border border-red-500/20 bg-red-500/10 p-2 rounded text-red-200">
                       <span className="font-bold">{alert.vehicle_id}</span>: {alert.alert_type} ({Math.round(alert.confidence*100)}% conf)
                    </div>
                  ))
                )}
              </div>
            }
            statusNode={
              <div className="mt-4 flex flex-col gap-2">
                {simulatorPanel}
                {statusContent}
              </div>
            }
          />
        </div>
      </div>

      {/* Global Status Bar */}
      <LiveStatusBar
        gpsOk
        wsConnected={p.wsConnected}
        offline={!p.online}
        roadLabel={p.activeRouteForStatus}
      />
    </div>
  )
}

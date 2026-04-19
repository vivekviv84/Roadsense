import React, { useState, useEffect, useRef } from 'react'
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react'
import type { DashboardLayoutProps } from './DashboardLayout'
import { NearbyDangerRadar } from '../NearbyDangerRadar'
import { useSafetyStore } from '../../store/safetyStore'

// ── False Positive Guard Card ────────────────────────────────────────────────

type FpRow = {
  scenario: string
  riskKey: string | null
  description: string
  mitigation: string
}

const FP_ROWS: FpRow[] = [
  { scenario: 'U-Turn at Junction',      riskKey: 'probable_uturn',         description: 'Low-speed heading reversal', mitigation: 'Suppress 8s if triggered' },
  { scenario: 'Roundabout Entry',         riskKey: 'roundabout_entry',        description: 'Bidirectional traversal',    mitigation: 'Auto-suppress' },
  { scenario: 'GPS Urban Canyon',         riskKey: 'gps_urban_canyon',        description: 'GPS accuracy > 35 m',        mitigation: 'Reduced confidence −40%' },
  { scenario: 'Road Works Diversion',     riskKey: 'road_works_diversion',    description: 'Zone construction active',   mitigation: 'Reclassify alert' },
  { scenario: 'Bidirectional Ambiguity',  riskKey: 'bidirectional_ambiguity', description: 'Non one-way road, low conf', mitigation: 'Raise consensus bar' },
]

function FalsePositiveGuard({ p }: { p: DashboardLayoutProps }) {
  const fp = p.falsePositiveAnalysis
  const [showTooltip, setShowTooltip] = useState(false)
  const [lastSuppressed, setLastSuppressed] = useState<{ riskCase: string; time: Date } | null>(null)
  const prevSuppressed = useRef(false)

  useEffect(() => {
    if (fp.suppressed && !prevSuppressed.current && fp.risk_case) {
      setLastSuppressed({ riskCase: fp.risk_case, time: new Date() })
    }
    prevSuppressed.current = fp.suppressed
  }, [fp.suppressed, fp.risk_case])

  function rowStatus(row: FpRow): { label: string; color: string; bg: string; border: string } {
    const isActive  = fp.risk_case === row.riskKey
    const isSupp    = isActive && fp.suppressed

    if (row.riskKey === 'road_works_diversion' && p.roadWorks.active) {
      return isSupp
        ? { label: '✓ SUPPRESSED', color: '#86efac', bg: 'rgba(34,197,94,.1)',  border: 'rgba(34,197,94,.35)' }
        : { label: 'ACTIVE',       color: '#fcd34d', bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.35)' }
    }
    if (row.riskKey === 'gps_urban_canyon' && p.gpsAccuracyM > 35) {
      return isSupp
        ? { label: '✓ SUPPRESSED', color: '#86efac', bg: 'rgba(34,197,94,.1)',  border: 'rgba(34,197,94,.35)' }
        : { label: `GPS ${p.gpsAccuracyM}m`, color: '#fcd34d', bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.35)' }
    }
    if (isSupp)   return { label: '✓ SUPPRESSED', color: '#86efac', bg: 'rgba(34,197,94,.1)',  border: 'rgba(34,197,94,.35)' }
    if (isActive) return { label: 'EVALUATING',   color: '#fcd34d', bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.35)' }
    return           { label: 'INACTIVE',          color: '#64748b', bg: 'transparent',         border: 'rgba(255,255,255,.05)' }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/50 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <ShieldCheck className="h-4 w-4 text-green-400" />
        <span className="text-sm font-semibold text-slate-200 tracking-wide flex-1">False Positive Guard</span>
        <div className="relative">
          <Info
            className="h-3.5 w-3.5 text-slate-500 cursor-help"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          />
          {showTooltip && (
            <div className="absolute right-0 bottom-6 z-50 w-64 rounded-xl border border-white/10 bg-slate-900 p-3 text-[11px] text-slate-300 leading-relaxed shadow-2xl">
              This guard prevents wrong-way alerts in known ambiguous scenarios such as diversions, roundabouts, and poor GPS zones.
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="space-y-1">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto] gap-2 px-2 mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Scenario</span>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Status</span>
        </div>
        {FP_ROWS.map((row) => {
          const s = rowStatus(row)
          return (
            <div
              key={row.riskKey}
              className="grid grid-cols-[1fr_auto] gap-2 items-center rounded-lg px-2 py-1.5 border transition-colors"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <div>
                <div className="text-[11px] font-medium text-slate-300">{row.scenario}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">{row.mitigation}</div>
              </div>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded whitespace-nowrap"
                style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Last suppressed */}
      <div className="pt-2 border-t border-white/10 text-[10px]">
        {lastSuppressed ? (
          <span className="text-slate-400">
            Last suppressed:{' '}
            <span className="text-amber-300 font-semibold">
              {lastSuppressed.riskCase.replace(/_/g, ' ')}
            </span>
            {' — '}
            {lastSuppressed.time.toLocaleTimeString()}
          </span>
        ) : (
          <span className="text-slate-600">No alerts suppressed this session</span>
        )}
      </div>
    </div>
  )
}

// ── SafetyView ───────────────────────────────────────────────────────────────

export function SafetyView({ p }: { p: DashboardLayoutProps }) {
  const isSafetyStale = useSafetyStore((s) => s.isSafetyAnalysisStale)
  const [lastSuppressed, setLastSuppressed] = useState<{ riskCase: string; time: Date } | null>(null)
  const prevSuppressed = useRef(false)

  useEffect(() => {
    if (p.falsePositiveAnalysis.suppressed && !prevSuppressed.current && p.falsePositiveAnalysis.risk_case) {
      setLastSuppressed({ riskCase: p.falsePositiveAnalysis.risk_case, time: new Date() })
    }
    prevSuppressed.current = p.falsePositiveAnalysis.suppressed
  }, [p.falsePositiveAnalysis.suppressed, p.falsePositiveAnalysis.risk_case])

  return (
    <div className="flex flex-col gap-6 p-8 max-w-4xl mx-auto h-full pb-32">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <ShieldAlert className="h-6 w-6 text-blue-400" />
        <h1 className="text-xl font-light tracking-widest text-slate-200">SAFETY SYSTEMS</h1>
      </div>

      {/* Safety Analysis Connection Warning */}
      {isSafetyStale && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200 text-xs">
          ⚠️ <span className="font-semibold">Safety analysis connection checking...</span> Data may be outdated. Last update several seconds ago.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Left column: Radar + FP Guard ── */}
        <div className="flex flex-col gap-4">
          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500">Spatial Radar</div>
          <NearbyDangerRadar bundle={p.collisionBundle} wrongWayActive={p.wrongWayCombined} />

          <div className={`mt-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            p.wrongWayCombined
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-green-500/30 bg-green-500/10 text-green-200'
          }`}>
            {p.wrongWayCombined ? '⚠ WRONG-WAY THREAT DETECTED' : '✓ Lane flow optimal'}
          </div>

          {p.wrongWayApi.active && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-4 text-xs space-y-2 mt-2">
              <div className="font-semibold text-red-300 uppercase tracking-widest">Wrong Way API Telemetry</div>
              <div className="text-slate-400">Heading drift: {p.wrongWayApi.current_heading?.toFixed(0)}° (expected {p.wrongWayApi.expected_heading?.toFixed(0)}°)</div>
              <div className="text-slate-400">Confidence: {(p.wrongWayApi.confidence).toFixed(0)}%</div>
              <div className="text-slate-400">Analysis: {p.wrongWayApi.reason}</div>
            </div>
          )}

          {/* False Positive Guard card */}
          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500 mt-2">False Positive Guard</div>
          <FalsePositiveGuard p={p} />
        </div>

        {/* ── Right column: Simulator panel ── */}
        <div className="rounded-2xl border border-white/10 bg-[#0a0f18] p-5 shadow-2xl flex flex-col" style={{ minHeight: 520 }}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
              <ShieldAlert size={16} className="text-amber-500" /> API SIMULATOR
            </div>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
              p.detectorHealth === 'online'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {p.detectorHealth}
            </div>
          </div>

          <div className="text-xs text-slate-400 mb-4 bg-black/40 p-3 rounded-lg border border-white/5">
            Force-inject backend anomaly scenarios directly onto route polyline.
            <div className="mt-1 text-[10px] text-blue-300">
              Tick: {p.simTick} | Time: {p.simTimeSec.toFixed(1)}s | Active Scenario: {p.detectorStatus.current_scenario}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={p.refreshDetectorStatus}
              disabled={p.detectorBusy}
              className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              REFRESH
            </button>
            <button
              onClick={p.toggleDetectorConsensus}
              disabled={p.detectorBusy || p.detectorHealth === 'offline'}
              className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              CONSENSUS: {p.detectorStatus.consensus_enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {p.detectorScenarios.map(scenario => (
              <button
                key={scenario.id}
                onClick={() => p.startDetectorScenario(scenario.id)}
                disabled={p.detectorBusy || p.detectorHealth === 'offline'}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  p.detectorStatus.current_scenario === scenario.id
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-100 ring-1 ring-blue-500/50'
                    : 'bg-black/30 border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-300'
                }`}
              >
                <div className="font-semibold text-sm">Scenario {scenario.id}</div>
                <div className="text-xs text-slate-500 mt-1">{scenario.name}</div>
              </button>
            ))}

            {/* Scenario 4: Road Works Zone */}
            <button
              onClick={p.hasActiveRoadWorks ? p.onClearRoadWorks : p.onStartRoadWorks}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                p.hasActiveRoadWorks
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-100 ring-1 ring-amber-500/40'
                  : 'bg-black/30 border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 text-slate-300'
              }`}
            >
              <div className="font-semibold text-sm">
                {p.hasActiveRoadWorks ? '✓ Road Works Zone Active' : '🚧 Road Works Zone'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {p.hasActiveRoadWorks
                  ? 'Click to clear — removes zone + diversion NPCs'
                  : 'Inject diversion zone near player position'}
              </div>
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
            <button
              onClick={p.onInjectIntruder}
              className="w-full bg-orange-500/20 border border-orange-500/50 text-orange-200 rounded-lg p-3 text-sm font-bold uppercase tracking-wider hover:bg-orange-500/30 transition-colors"
              style={{ textShadow: '0 0 8px rgba(251,146,60,0.6)' }}
            >
              🚨 Inject Wrong-Way Intruder
            </button>
            <button
              onClick={p.stopDetectorScenario}
              disabled={p.detectorBusy || !p.detectorStatus.sim_running}
              className="w-full bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg p-3 text-sm font-semibold uppercase tracking-wider hover:bg-red-500/30 transition-colors disabled:opacity-40"
            >
              STOP SCENARIO
            </button>
          </div>
        </div>
      </div>

      {/* ── Active alerts grid ── */}
      {p.activeAlerts.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
          <h3 className="text-slate-300 font-semibold mb-3 text-sm tracking-wide uppercase">Active Security Anomalies</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.activeAlerts.map(alert => {
              const isRoadWorks = alert.alert_type?.toLowerCase().includes('road') ||
                                  alert.attack_class?.toLowerCase().includes('diversion')
              const borderCls = isRoadWorks ? 'border-amber-500/30' : 'border-red-500/30'
              const badgeCls  = isRoadWorks
                ? 'bg-amber-500/20 text-amber-200'
                : 'bg-red-500/20 text-red-200'
              const label     = isRoadWorks ? 'ROAD WORKS' : alert.alert_type
              return (
                <div key={alert.alert_id} className={`bg-black/40 border ${borderCls} p-3 rounded-lg text-xs space-y-1`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`font-bold ${isRoadWorks ? 'text-amber-200' : 'text-red-200'}`}>
                      {alert.vehicle_id}
                    </span>
                    <span className={`px-2 py-0.5 ${badgeCls} rounded text-[9px] uppercase`}>{label}</span>
                  </div>
                  <div className="text-slate-400">{alert.attack_class}</div>
                  <div className="text-slate-500">Confidence {(alert.confidence * 100).toFixed(0)}%</div>
                  {alert.vehicles_at_risk[0] && (
                    <div className={`mt-1 border-t ${isRoadWorks ? 'border-amber-500/20 text-amber-400/80' : 'border-red-500/20 text-red-400/80'} pt-1`}>
                      Target: {alert.vehicles_at_risk[0].vehicle_id} TTC {alert.vehicles_at_risk[0].estimated_ttc_sec.toFixed(1)}s
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

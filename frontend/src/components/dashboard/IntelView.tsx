import React from 'react'
import { Cpu, Navigation, AlertTriangle, ShieldCheck, MapPin } from 'lucide-react'
import type { DashboardLayoutProps } from './DashboardLayout'
import type { OsmCheck, RoadWorksStatus, FalsePositiveAnalysis, WrongWayPayload } from '../../types/safety'
import { TelemetryPanel } from '../TelemetryPanel'
import { RoadConfidenceCard } from '../RoadConfidenceCard'
import { CorrectionRoutePanel } from '../CorrectionRoutePanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function angularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function Chip({
  label,
  color,
}: {
  label: string
  color: 'green' | 'amber' | 'red' | 'slate'
}) {
  const palette = {
    green: 'bg-green-500/20 text-green-300 border-green-500/40',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    red: 'bg-red-500/20 text-red-300 border-red-500/40',
    slate: 'bg-white/5 text-slate-400 border-white/10',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${palette[color]}`}>
      {label}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  mono = false,
  borderColor = 'border-white/5',
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  borderColor?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-2 border-l-2 pl-3 py-1 ${borderColor}`}>
      <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
      <span className={`text-right text-[11px] text-slate-200 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detection Reasoning Card
// ---------------------------------------------------------------------------

function DetectionReasoningCard({
  osmCheck,
  roadWorks,
  falsePositiveAnalysis,
  wrongWay,
  egoBearing,
}: {
  osmCheck: OsmCheck
  roadWorks: RoadWorksStatus
  falsePositiveAnalysis: FalsePositiveAnalysis
  wrongWay: WrongWayPayload
  egoBearing: number
}) {
  // Row 2 — heading delta vs OSM allowed bearing
  const headingDelta =
    osmCheck.allowed_bearing != null
      ? angularDiff(egoBearing, osmCheck.allowed_bearing)
      : null

  const headingStatus: 'green' | 'amber' | 'red' =
    headingDelta == null
      ? 'green'
      : headingDelta < 30
      ? 'green'
      : headingDelta < 120
      ? 'amber'
      : 'red'

  const headingLabel =
    headingDelta == null ? '—' : headingDelta < 30 ? 'ALIGNED' : headingDelta < 120 ? 'DEVIATION' : 'VIOLATION'

  // Row 5 — Final verdict
  const verdict: { label: string; color: 'green' | 'amber' | 'red' } = (() => {
    if (roadWorks.active) return { label: 'ROAD WORKS', color: 'amber' }
    if (falsePositiveAnalysis.suppressed) return { label: 'CAUTION', color: 'amber' }
    if (wrongWay.active) return { label: 'WRONG WAY', color: 'red' }
    if (osmCheck.osm_violation) return { label: 'WRONG WAY', color: 'red' }
    return { label: 'CLEAR', color: 'green' }
  })()

  const confidence = Math.min(100, Math.max(0, wrongWay.confidence))

  const confBarColor =
    confidence >= 70 ? '#ef4444' : confidence >= 40 ? '#f59e0b' : '#22c55e'

  return (
    <div className="rounded-2xl border border-white/10 bg-black/50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <ShieldCheck className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-semibold text-slate-200 tracking-wide">Detection Reasoning</span>
      </div>

      {/* Row 1 — Road Context */}
      <div>
        <SectionLabel>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Road Context</span>
        </SectionLabel>
        <div className="space-y-1">
          <Row
            label="Road Name"
            value={osmCheck.road_name ?? 'Unknown'}
            borderColor="border-blue-500/30"
          />
          <Row
            label="Type"
            value={
              osmCheck.is_oneway == null
                ? '—'
                : osmCheck.is_oneway
                ? 'One-Way'
                : 'Bidirectional'
            }
            borderColor="border-blue-500/30"
          />
          <Row
            label="Allowed Bearing"
            value={osmCheck.allowed_bearing != null ? `${osmCheck.allowed_bearing}°` : '—'}
            mono
            borderColor="border-blue-500/30"
          />
        </div>
      </div>

      {/* Row 2 — Heading Analysis */}
      <div>
        <SectionLabel>
          <span className="inline-flex items-center gap-1"><Navigation className="h-3 w-3" /> Heading Analysis</span>
        </SectionLabel>
        <div className="space-y-1">
          <Row
            label="Ego Bearing"
            value={`${Math.round(egoBearing)}°`}
            mono
            borderColor="border-slate-600/40"
          />
          <Row
            label="Heading Delta"
            value={headingDelta != null ? `${Math.round(headingDelta)}°` : '—'}
            mono
            borderColor={
              headingStatus === 'red'
                ? 'border-red-500/60'
                : headingStatus === 'amber'
                ? 'border-amber-500/60'
                : 'border-green-500/40'
            }
          />
          <Row
            label="Status"
            value={<Chip label={headingLabel} color={headingStatus} />}
            borderColor={
              headingStatus === 'red'
                ? 'border-red-500/60'
                : headingStatus === 'amber'
                ? 'border-amber-500/60'
                : 'border-green-500/40'
            }
          />
        </div>
      </div>

      {/* Row 3 — Consensus Signals */}
      <div>
        <SectionLabel>
          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Consensus Signals</span>
        </SectionLabel>
        <div className="space-y-1">
          <Row
            label="OSM Check"
            value={
              <Chip
                label={osmCheck.osm_violation ? 'FAIL' : 'PASS'}
                color={osmCheck.osm_violation ? 'red' : 'green'}
              />
            }
            borderColor={osmCheck.osm_violation ? 'border-red-500/60' : 'border-green-500/40'}
          />
          <Row
            label="Traffic Consensus"
            value={
              <Chip
                label={wrongWay.active ? 'FAIL' : 'PASS'}
                color={wrongWay.active ? 'red' : 'green'}
              />
            }
            borderColor={wrongWay.active ? 'border-red-500/60' : 'border-green-500/40'}
          />
          <Row
            label="Road Works Active"
            value={
              <Chip
                label={roadWorks.active ? 'YES' : 'NO'}
                color={roadWorks.active ? 'amber' : 'slate'}
              />
            }
            borderColor={roadWorks.active ? 'border-amber-500/60' : 'border-white/5'}
          />
        </div>
      </div>

      {/* Row 4 — False Positive Guard */}
      <div>
        <SectionLabel>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> False Positive Guard</span>
        </SectionLabel>
        <div className="space-y-1">
          <Row
            label="Risk Case"
            value={falsePositiveAnalysis.risk_case ?? 'None'}
            borderColor={falsePositiveAnalysis.risk_case ? 'border-amber-500/50' : 'border-green-500/30'}
          />
          <Row
            label="Mitigation"
            value={
              <span className="text-right text-[10px] text-slate-400 leading-tight max-w-[160px] break-words">
                {falsePositiveAnalysis.mitigation_description || '—'}
              </span>
            }
            borderColor={
              falsePositiveAnalysis.mitigation_applied ? 'border-amber-500/50' : 'border-white/5'
            }
          />
          <Row
            label="Alert Suppressed"
            value={
              <Chip
                label={falsePositiveAnalysis.suppressed ? 'YES' : 'NO'}
                color={falsePositiveAnalysis.suppressed ? 'amber' : 'slate'}
              />
            }
            borderColor={falsePositiveAnalysis.suppressed ? 'border-amber-500/60' : 'border-white/5'}
          />
        </div>
      </div>

      {/* Row 5 — Final Verdict */}
      <div className="pt-1 border-t border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Final Verdict</span>
          <Chip label={verdict.label} color={verdict.color} />
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span>Wrong-Way Confidence</span>
            <span className="font-mono text-slate-300">{Math.round(confidence)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${confidence}%`, background: confBarColor }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IntelView
// ---------------------------------------------------------------------------

export function IntelView({ p }: { p: DashboardLayoutProps }) {
  return (
    <div className="flex flex-col gap-6 p-8 max-w-4xl mx-auto h-full pb-32">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Cpu className="h-6 w-6 text-blue-400" />
        <h1 className="text-xl font-light tracking-widest text-slate-200">INTELLIGENCE SUBSYSTEM</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-4">
          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500">Live Telemetry</div>
          <TelemetryPanel
            speedKmh={p.telemetry.speedKmh}
            bearing={p.telemetry.bearing}
            lane={p.telemetry.lane}
            drivingEnabled={p.telemetry.drivingEnabled}
            remainingLabel={p.telemetry.remainingLabel}
            etaLabel={p.telemetry.etaLabel}
          />

          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500 mt-2">Recovery Route Vector</div>
          {p.wrongWayCombined && p.correctionPlan ? (
            <CorrectionRoutePanel plan={p.correctionPlan} visible={true} />
          ) : (
            <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-xs text-slate-500 text-center">
              No active fallback routing required.
            </div>
          )}

          {/* Detection Reasoning Card — left column, below recovery route */}
          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500 mt-2">Detection Reasoning</div>
          <DetectionReasoningCard
            osmCheck={p.osmCheck}
            roadWorks={p.roadWorks}
            falsePositiveAnalysis={p.falsePositiveAnalysis}
            wrongWay={p.wrongWayApi}
            egoBearing={p.telemetry.bearing}
          />
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-4">
          <div className="rs-detect-head text-xs font-semibold uppercase tracking-wide text-slate-500">Road Intelligence</div>

          <RoadConfidenceCard
            intel={p.roadIntelligence}
            warning={p.roadWarning}
            timeSlot={p.safetyTimeSlot}
          />

          {p.roadIntelligence ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 mt-2 space-y-3">
              <div className="font-semibold text-slate-300 text-sm mb-4 border-b border-white/10 pb-2">Segment Analytical Mesh</div>
              {Object.entries(p.roadIntelligence).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-lg">
                  <span className="text-xs text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-slate-200 font-mono text-xs font-bold text-right">
                    {typeof val === 'number' ? val.toFixed(2) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-sm text-center text-slate-500">
              Gathering traffic flow coefficients from backend...
            </div>
          )}

          <div className="mt-4 p-4 rounded-xl border border-white/5 bg-blue-500/5 text-blue-200/60 text-[11px] leading-relaxed">
            The Federated privacy-preserving layer actively synthesizes segment coefficients with historical time-series data. Ensure Backend WebSocket Connection is ONLINE.
          </div>
        </div>
      </div>
    </div>
  )
}

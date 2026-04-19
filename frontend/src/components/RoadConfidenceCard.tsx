import { motion } from 'framer-motion'
import { Compass, TrendingUp } from 'lucide-react'
import type { RoadIntelligence, RoadWarning } from '../types/safety'

type Props = {
  intel: RoadIntelligence | null
  warning: RoadWarning
  /** Backend 4h bucket index 0..5 */
  timeSlot: number
}

const SLOT_LABEL = ['Night', 'Early', 'Morning', 'Afternoon', 'Evening', 'Late']

export function RoadConfidenceCard({ intel, warning, timeSlot }: Props) {
  if (!intel) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-4 text-sm text-slate-500">
        Road intelligence loads after route sync…
      </div>
    )
  }

  const dom = intel.dominant_direction
  const pct = intel.confidence

  return (
    <motion.div
      layout
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-4 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Compass className="h-4 w-4 text-cyan-400" />
          Road intelligence
        </div>
        <TrendingUp className="h-4 w-4 text-slate-500" />
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        Village / unknown roads — historical flow by time bucket ({SLOT_LABEL[timeSlot % SLOT_LABEL.length]})
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Confidence</span>
          <span className="font-mono text-cyan-300">{pct.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Dominant octant</span>
          <span className="font-medium text-white">{dom ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Samples</span>
          <span>{intel.total_samples}</span>
        </div>
      </div>
      {warning.active ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
        >
          Your direction may oppose high-confidence historical flow ({warning.reason}).
        </motion.div>
      ) : (
        <div className="mt-3 text-xs text-emerald-400/90">Flow alignment OK for recorded history.</div>
      )}
    </motion.div>
  )
}

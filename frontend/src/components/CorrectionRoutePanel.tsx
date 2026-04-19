import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CornerDownRight, RotateCcw } from 'lucide-react'
import type { CorrectionRoutePayload } from '../types/safety'

type Props = {
  plan: CorrectionRoutePayload | null
  visible: boolean
}

const iconMap: Record<string, typeof ArrowRight> = {
  'arrow-up': ArrowRight,
  'u-turn': RotateCcw,
  merge: CornerDownRight,
}

export function CorrectionRoutePanel({ plan, visible }: Props) {
  return (
    <AnimatePresence>
      {visible && plan ? (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          className="rounded-2xl border border-blue-500/30 bg-slate-900/85 p-4 shadow-xl backdrop-blur-md"
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-blue-300/90">
            Safe correction
          </div>
          <p className="mb-3 text-[11px] text-slate-400">{plan.notes}</p>
          <ol className="space-y-3">
            {plan.steps.map((step, idx) => {
              const Ico = iconMap[step.icon] ?? ArrowRight
              return (
                <li key={step.id} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
                    <Ico className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white">
                      {idx + 1}. {step.instruction}
                    </div>
                    {step.distance_m != null ? (
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        ≈ {Math.round(step.distance_m)} m
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
          {plan.rejoin_eta_sec != null ? (
            <div className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
              Rejoin ETA ~ {Math.round(plan.rejoin_eta_sec / 60)} min (est.)
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

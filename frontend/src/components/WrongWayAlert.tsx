import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { playWarningBeep } from '../lib/beep'
import type { WrongWayPayload } from '../types/safety'

type Props = {
  /** Backend traffic-flow detection */
  apiWrongWay: WrongWayPayload
  /** Local lane heuristic (simulation) */
  localWrongLane: boolean
  soundEnabled: boolean
  onSoundToggle: () => void
}

export function WrongWayAlert({ apiWrongWay, localWrongLane, soundEnabled, onSoundToggle }: Props) {
  const active = apiWrongWay.active || localWrongLane
  const lastBeep = useRef(0)

  useEffect(() => {
    if (!active || !soundEnabled) return
    const now = Date.now()
    if (now - lastBeep.current < 900) return
    lastBeep.current = now
    playWarningBeep(true)
  }, [active, soundEnabled])

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="pointer-events-auto fixed left-1/2 top-3 z-[60] w-[min(96vw,720px)] -translate-x-1/2"
        >
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-red-500/80 bg-gradient-to-r from-red-950/95 via-red-900/90 to-red-950/95 px-5 py-3 shadow-[0_0_40px_rgba(239,68,68,0.35)] backdrop-blur-md"
            style={{ animation: 'ww-pulse 1.4s ease-in-out infinite' }}
          >
            <style>{`
              @keyframes ww-pulse {
                0%, 100% { box-shadow: 0 0 28px rgba(239,68,68,0.35); }
                50% { box-shadow: 0 0 48px rgba(239,68,68,0.55); }
              }
            `}</style>
            <div className="flex items-start gap-3">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/40 text-red-100"
              >
                <AlertTriangle className="h-6 w-6" aria-hidden />
              </motion.div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200/90">
                  Wrong Lane Detected
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {apiWrongWay.active
                    ? 'Traffic flow indicates you may be opposing the dominant direction.'
                    : 'Lane traffic pattern suggests wrong-way risk in simulation.'}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-red-100/85">
                  <span>Confidence {Math.round(apiWrongWay.confidence || (localWrongLane ? 72 : 0))}%</span>
                  <span>
                    Heading {apiWrongWay.current_heading.toFixed(0)}° vs expected{' '}
                    {apiWrongWay.expected_heading.toFixed(0)}°
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onSoundToggle}
                className="shrink-0 rounded-lg border border-red-400/30 bg-black/20 px-2 py-1 text-[11px] text-red-100 hover:bg-black/35"
              >
                Sound {soundEnabled ? 'on' : 'off'}
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

import { motion } from 'framer-motion'
import { Gauge, LocateFixed } from 'lucide-react'

type Props = {
  speedKmh: number
  bearing: number
  lane: string
  drivingEnabled: boolean
  remainingLabel: string
  etaLabel: string
}

export function TelemetryPanel({
  speedKmh,
  bearing,
  lane,
  drivingEnabled,
  remainingLabel,
  etaLabel,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Gauge className="h-4 w-4 text-blue-400" />
          Live telemetry
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-slate-500">Speed</div>
            <motion.div
              key={Math.round(speedKmh)}
              initial={{ opacity: 0.6, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-mono text-2xl font-bold text-white"
            >
              {Math.round(speedKmh)}
              <span className="ml-1 text-sm font-normal text-slate-500">km/h</span>
            </motion.div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">Heading</div>
            <div className="flex items-center gap-1 font-mono text-xl text-slate-100">
              <LocateFixed className="h-4 w-4 text-cyan-400" />
              {bearing.toFixed(0)}°
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">Lane</div>
            <div className="font-medium capitalize text-slate-200">{lane}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">Drive</div>
            <div className={drivingEnabled ? 'text-emerald-400' : 'text-amber-400'}>
              {drivingEnabled ? 'Running' : 'Paused'}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-xs text-slate-400">
        <div className="text-[10px] uppercase text-slate-500">Route</div>
        <div className="mt-1 text-sm text-slate-200">{remainingLabel}</div>
        <div className="mt-1 text-slate-500">ETA left: {etaLabel}</div>
      </div>
    </div>
  )
}

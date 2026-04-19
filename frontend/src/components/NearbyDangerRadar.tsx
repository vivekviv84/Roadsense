import { motion } from 'framer-motion'
import { Activity, Footprints, Navigation } from 'lucide-react'
import type { CollisionBundle } from '../types/safety'

type Props = {
  bundle: CollisionBundle | null
  wrongWayActive: boolean
}

const riskColor: Record<string, string> = {
  LOW: 'text-emerald-400',
  MEDIUM: 'text-amber-400',
  HIGH: 'text-red-400',
}

export function NearbyDangerRadar({ bundle, wrongWayActive }: Props) {
  if (!wrongWayActive || !bundle) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-sm text-slate-500">
        No active collision radar — wrong-way not detected.
      </div>
    )
  }

  const d = bundle.driver_alert
  const ped = bundle.pedestrians.slice(0, 4)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-inner">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Activity className="h-4 w-4 text-blue-400" />
          Danger radar
        </div>
        <span className={`text-xs font-bold uppercase ${riskColor[d.collision_risk] ?? 'text-slate-300'}`}>
          {d.collision_risk}
        </span>
      </div>

      <div className="relative mx-auto mb-4 flex h-36 w-36 items-center justify-center">
        {[72, 54, 36].map((r, i) => (
          <motion.div
            key={r}
            className="absolute rounded-full border border-red-500/25"
            style={{ width: r * 2, height: r * 2 }}
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.96, 1, 0.96] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
        <div className="relative z-10 text-center">
          <div className="text-2xl font-bold text-white">{d.distance_m.toFixed(0)}m</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">threat range</div>
        </div>
      </div>

      <div className="space-y-2 text-xs text-slate-300">
        <div className="flex justify-between gap-2">
          <span className="flex items-center gap-1 text-slate-400">
            <Navigation className="h-3.5 w-3.5" /> Relative
          </span>
          <span className="font-medium text-slate-100">{d.relative_direction}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Closing speed</span>
          <span>{d.closing_speed_kmh.toFixed(1)} km/h</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Time to impact (est.)</span>
          <span>{d.eta_impact_sec > 900 ? '—' : `${d.eta_impact_sec.toFixed(1)} s`}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Safe stop dist.</span>
          <span>{d.safe_stop_distance_m.toFixed(0)} m</span>
        </div>
      </div>

      {ped.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
            <Footprints className="h-3.5 w-3.5" />
            Pedestrians nearby
          </div>
          <ul className="space-y-1.5">
            {ped.map((p) => (
              <li key={p.id ?? p.distance_m} className="flex justify-between text-[11px] text-slate-400">
                <span>{p.advisory.slice(0, 42)}…</span>
                <span className={riskColor[p.collision_risk] ?? ''}>{p.collision_risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

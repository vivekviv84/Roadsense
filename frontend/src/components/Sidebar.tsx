import { motion } from 'framer-motion'
import { MapPinned, Navigation, Shield, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

type Props = {
  routePlanner: ReactNode
  statusSlot: ReactNode
  safetySlot?: ReactNode
  intelSlot?: ReactNode
}

const tabs = [
  { icon: Navigation, label: 'Drive' },
  { icon: MapPinned, label: 'Route' },
  { icon: Shield, label: 'Safety' },
  { icon: Sparkles, label: 'Intel' },
]

export function Sidebar({ routePlanner, statusSlot, safetySlot, intelSlot }: Props) {
  const [activeTab, setActiveTab] = useState<string>('Drive')

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 lg:w-[320px] xl:w-[340px]">
      <div className="flex shrink-0 gap-1 rounded-2xl border border-white/10 bg-slate-900/50 p-1.5">
        {tabs.map((n) => (
          <motion.button
            key={n.label}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveTab(n.label)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition-colors duration-150 ${
              activeTab === n.label
                ? 'bg-blue-600/25 text-blue-100'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </motion.button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/40 shadow-inner">
        {activeTab === 'Drive' && (
          <div className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Driving HUD</div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400 leading-relaxed">
              The 3D driving simulation is active in the center panel. Use arrow keys to change lanes, Space to pause, and the Spawn button to add traffic.
            </div>
            {statusSlot && <div className="mt-3">{statusSlot}</div>}
          </div>
        )}
        {activeTab === 'Route' && routePlanner}
        {activeTab === 'Safety' && (
          safetySlot ?? (
            <div className="p-4 text-xs text-slate-500">
              Safety panel — start a simulation scenario to view live threat data here.
            </div>
          )
        )}
        {activeTab === 'Intel' && (
          intelSlot ?? (
            <div className="p-4 text-xs text-slate-500">
              Road intelligence history is populated as you drive routes and the backend collects traffic flow data.
            </div>
          )
        )}
      </div>
    </aside>
  )
}

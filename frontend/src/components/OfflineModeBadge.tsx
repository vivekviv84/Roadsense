import { motion } from 'framer-motion'
import { CloudOff, Database } from 'lucide-react'

type Props = {
  offline: boolean
  lastSync: number | null
  predictedHeading: number | null
}

export function OfflineModeBadge({ offline, lastSync, predictedHeading }: Props) {
  if (!offline) return null

  const syncLabel = lastSync ? new Date(lastSync).toLocaleTimeString() : 'never'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100"
    >
      <CloudOff className="h-3.5 w-3.5" />
      Offline mode active
      <span className="flex items-center gap-1 text-amber-200/80">
        <Database className="h-3 w-3" />
        last sync {syncLabel}
      </span>
      {predictedHeading != null ? (
        <span className="text-amber-100/90">HDG ~{predictedHeading.toFixed(0)}°</span>
      ) : null}
    </motion.div>
  )
}

import { Cpu, MapPin, Radio, WifiOff } from 'lucide-react'

type Props = {
  gpsOk: boolean
  wsConnected: boolean
  offline: boolean
  roadLabel: string
}

export function LiveStatusBar({ gpsOk, wsConnected, offline, roadLabel }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/40 px-4 py-2.5 text-[11px] text-slate-400 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className={`h-3.5 w-3.5 ${gpsOk ? 'text-emerald-400' : 'text-amber-400'}`} />
          GPS {gpsOk ? 'fix' : 'weak'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Radio className={`h-3.5 w-3.5 ${wsConnected ? 'text-emerald-400' : 'text-slate-500'}`} />
          Stream {wsConnected ? 'live' : 'down'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {offline ? <WifiOff className="h-3.5 w-3.5 text-amber-400" /> : <Cpu className="h-3.5 w-3.5 text-slate-400" />}
          {offline ? 'Offline predict' : 'Online'}
        </span>
      </div>
      <div className="max-w-[min(100%,420px)] truncate text-slate-500">
        <span className="text-slate-600">Road </span>
        {roadLabel}
      </div>
    </div>
  )
}

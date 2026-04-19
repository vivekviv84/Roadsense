import React from 'react'

type Props = {
  telemetryNode: React.ReactNode
  radarNode: React.ReactNode
  alertsNode: React.ReactNode
  statusNode: React.ReactNode
}

export function InfoView({ telemetryNode, radarNode, alertsNode, statusNode }: Props) {
  return (
    <div className="flex h-full w-full overflow-y-auto dark:bg-slate-950 bg-slate-50 p-6 transition-colors duration-500">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-8 text-2xl font-bold tracking-tight dark:text-white text-slate-800">System Information</h1>
        
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Main Telemetry & Radar (Core Info) */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-slate-900/50 bg-white p-6 shadow-lg transition-colors">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider dark:text-slate-400 text-slate-500">Live Telemetry</h2>
              <div className="[&>div]:bg-transparent [&>div]:border-none [&>div]:p-0 [&>div]:shadow-none [&_.text-white]:dark:text-white [&_.text-white]:text-slate-800">
                {telemetryNode}
              </div>
            </div>
            
            <div className="rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-slate-900/50 bg-white p-6 shadow-lg transition-colors">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider dark:text-slate-400 text-slate-500">Spatial Radar</h2>
              {radarNode}
            </div>
          </div>
          
          {/* Sidebar / Alerts / Status */}
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-slate-900/50 bg-white p-6 shadow-lg transition-colors">
               <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider dark:text-slate-400 text-slate-500">
                 <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                 Active Alerts
               </h2>
               <div className="flex flex-col gap-3">
                 {alertsNode}
               </div>
            </div>

            <div className="rounded-2xl border dark:border-white/10 border-slate-200 dark:bg-slate-900/50 bg-white p-6 shadow-lg transition-colors">
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wider dark:text-slate-400 text-slate-500">System Logs</h2>
              <div className="max-h-64 overflow-y-auto text-xs dark:text-slate-500 text-slate-600 font-mono">
                <div className="mb-2">System booted...</div>
                <div className="mb-2 dark:text-green-400 text-green-600">WebSocket connected (detector stream live)</div>
                <div className="mb-2">GPS synchronized via photon API</div>
                {statusNode}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

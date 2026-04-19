import React from 'react'

interface InfoViewProps {
  telemetryNode: React.ReactNode
  radarNode: React.ReactNode
  alertsNode: React.ReactNode
  statusNode: React.ReactNode
}

export function InfoView({ telemetryNode, radarNode, alertsNode, statusNode }: InfoViewProps) {
  return (
    <div className="h-full w-full bg-[#050505] text-slate-200 overflow-y-auto overflow-x-hidden p-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-32">
        <div className="flex items-end justify-between border-b border-white/10 pb-4">
          <div>
             <h1 className="text-3xl font-light tracking-widest uppercase text-white mb-1">Vehicle Data</h1>
             <p className="text-slate-500 text-sm tracking-wide">Live Telemetry & AI Subsystem</p>
          </div>
          <div className="text-right">
             <div className="text-xs text-green-500 font-medium uppercase tracking-wider mb-1 px-2 py-1 bg-green-500/10 rounded-full inline-block border border-green-500/20">System Nominal</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Telemetry & Radar (Occupies 8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            <div className="bg-[#111111]/80 rounded-3xl p-6 border border-white/5 shadow-2xl">
               <h2 className="text-xs text-slate-500 uppercase tracking-[0.2em] font-semibold mb-6">Drive Telemetry</h2>
               <div className="filter drop-shadow-lg [&>div]:bg-transparent [&>div]:border-none [&>div]:p-0 [&>div]:shadow-none">
                 {telemetryNode}
               </div>
            </div>

            <div className="bg-[#111111]/80 rounded-3xl p-6 border border-white/5 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px]" />
               <h2 className="text-xs text-slate-500 uppercase tracking-[0.2em] font-semibold mb-6">Spatial Intelligence</h2>
               {radarNode}
            </div>
          </div>

          {/* Right sidebar: Alerts & Status (Occupies 4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-8">
             <div className="bg-[#111111]/80 rounded-3xl p-6 border border-white/5 shadow-2xl border-t-2 border-t-red-500/50">
               <h2 className="text-xs text-slate-500 uppercase tracking-[0.2em] font-semibold mb-6 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                 Active Alerts
               </h2>
               <div className="flex flex-col gap-3 min-h-[100px]">
                 {alertsNode}
               </div>
             </div>

             <div className="bg-[#111111]/80 rounded-3xl p-6 border border-white/5 shadow-2xl flex-1">
               <h2 className="text-xs text-slate-500 uppercase tracking-[0.2em] font-semibold mb-6">Backend Status</h2>
               <div className="space-y-4">
                 {statusNode}
               </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  )
}

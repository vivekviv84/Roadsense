import React from 'react'

type Props = {
  mapNode: React.ReactNode
  threeNode: React.ReactNode
  routePlannerNode: React.ReactNode
}

export function NavigationView({ mapNode, threeNode, routePlannerNode }: Props) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Menu / Map Panel */}
      <div className="flex w-[400px] shrink-0 flex-col border-r dark:border-slate-800 border-slate-200 dark:bg-slate-900 bg-white p-4 transition-colors duration-500">
        {/* Mock/Status Header */}
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-wide dark:text-slate-300 text-slate-700 uppercase">Routing Engine</h2>
          <p className="text-xs dark:text-slate-500 text-slate-400 mb-2">Live GPS tracking active</p>
          <div className="rounded-xl border dark:border-white/5 border-slate-200 dark:bg-black/20 bg-slate-50 overflow-hidden">
            {routePlannerNode}
          </div>
        </div>
        
        {/* Map Container */}
        <div className="relative flex-1 overflow-hidden rounded-xl border dark:border-white/10 border-slate-200 shadow-inner dark:bg-black/50 bg-slate-100">
          {mapNode}
        </div>
      </div>

      {/* Right 3D Scene Panel */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-slate-950">
        {threeNode}
      </div>
    </div>
  )
}

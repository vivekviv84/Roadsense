import React from 'react'

interface NavigationViewProps {
  mapNode: React.ReactNode
  threeNode: React.ReactNode
  routePlannerNode: React.ReactNode
}

export function NavigationView({ mapNode, threeNode, routePlannerNode }: NavigationViewProps) {
  // Tesla uses a split view or an overlay view.
  // Left side is typically the routing / map. Right side is Three.js (Autopilot Visualization).
  return (
    <div className="w-full h-full flex bg-[#000]">
      {/* Left side: Map representation (1/3 width, or 400px) */}
      <div className="w-[30%] min-w-[400px] h-full relative z-10 border-r border-[#222] overflow-hidden flex flex-col bg-[#111]">
        {/* We reuse the passed map node which handles the Leaflet/MapLibre instance */}
        <div className="flex-1 overflow-hidden relative">
           {mapNode}
           
           {/* Float the route planner over the map like a true navigation app */}
           <div className="absolute top-4 left-4 right-4 z-50 bg-[#111111]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
             {routePlannerNode}
           </div>

           {/* Dark gradient overlay at the bottom so it fades nicely */}
           <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#111] to-transparent pointer-events-none" />
           <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[#111]/80 to-transparent pointer-events-none z-10" />
        </div>
      </div>

      {/* Right side: Three.js Autopilot visualization */}
      <div className="flex-1 h-full relative overflow-hidden bg-black flex flex-col">
        {threeNode}
      </div>
    </div>
  )
}

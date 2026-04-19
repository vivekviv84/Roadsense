import React from 'react'
import { Phone, Settings, Activity, Video } from 'lucide-react'

export function DashboardView() {
  const actions = [
    { id: 'youtube', type: 'link', href: 'https://youtube.com', label: 'Entertainment', icon: Video, color: 'text-red-500' },
    { id: 'phone', type: 'link', href: 'tel:0000000', label: 'Phone', icon: Phone, color: 'text-green-500' },
    { id: 'settings', type: 'button', label: 'Vehicle Settings', icon: Settings, color: 'text-slate-300' },
    { id: 'status', type: 'button', label: 'System Status', icon: Activity, color: 'text-blue-500' }
  ]

  return (
    <div className="h-full w-full bg-gradient-to-br from-[#0c0c0c] to-[#050505] flex items-center justify-center relative overflow-hidden">
      {/* Background glow behind the car */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl w-full p-10 flex flex-col md:flex-row items-center justify-between z-10 gap-16">

        {/* Car Model placeholder */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="relative">
            <img
              src="/car.png"
              alt="Model Vehicle Placeholder"
              className="w-full max-w-[600px] object-contain drop-shadow-2xl transition-transform hover:scale-105 duration-700"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/car-front.svg';
                target.className = 'w-64 h-64 opacity-50';
              }}
            />
            {/* Fake headlights/glow */}
            <div className="absolute left-[20%] top-[40%] w-12 h-12 bg-white/40 blur-xl pointer-events-none rounded-full" />
            <div className="absolute right-[20%] top-[40%] w-12 h-12 bg-white/40 blur-xl pointer-events-none rounded-full" />
          </div>
          <div className="mt-8 text-center space-y-2">
            <h1 className="text-3xl font-light text-white tracking-widest uppercase">System Online</h1>
            <p className="text-slate-400 text-sm tracking-wider">Parked · 82% Battery</p>
          </div>
        </div>

        {/* Action Buttons Panel */}
        <div className="w-full md:w-96 flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-slate-500 mb-2 px-2">Quick Controls</h2>

          <div className="grid grid-cols-2 gap-4">
            {actions.map(action => {
              const ActionTag = action.type === 'link' ? 'a' : 'button';
              return (
                <ActionTag
                  key={action.id}
                  href={action.href}
                  target={action.type === 'link' ? '_blank' : undefined}
                  rel={action.type === 'link' ? 'noreferrer' : undefined}
                  className="flex flex-col items-center justify-center gap-3 bg-[#161616]/80 hover:bg-[#222] border border-white/5 rounded-3xl p-6 transition-all duration-300 shadow-xl backdrop-blur-md group"
                >
                  <action.icon className={`w-8 h-8 ${action.color} transition-transform duration-300 group-hover:scale-110`} />
                  <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">{action.label}</span>
                </ActionTag>
              )
            })}
          </div>

          <div className="mt-4 bg-[#161616]/80 border border-white/5 rounded-3xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-slate-400">Cabin Temp</span>
              <span className="text-xl text-white font-light">22°C</span>
            </div>
            <div className="h-2 w-full bg-black rounded-full overflow-hidden">
               <div className="h-full bg-gradient-to-r from-blue-500 to-red-500 w-[60%]" />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

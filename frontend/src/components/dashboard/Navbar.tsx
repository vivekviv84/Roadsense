import React from 'react'
import { Car, Navigation, Shield, Cpu } from 'lucide-react'

export type TabKey = 'drive' | 'route' | 'safety' | 'intel'

interface NavbarProps {
  activeTab: TabKey
  onSelect: (tab: TabKey) => void
}

export function Navbar({ activeTab, onSelect }: NavbarProps) {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'drive', label: 'Drive', icon: <Car size={20} /> },
    { key: 'route', label: 'Route', icon: <Navigation size={20} fill="currentColor" /> },
    { key: 'safety', label: 'Safety', icon: <Shield size={20} /> },
    { key: 'intel', label: 'Intel', icon: <Cpu size={20} /> }
  ];

  return (
    <div className="absolute bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="flex gap-2 p-2 rounded-3xl backdrop-blur-2xl bg-[#111111]/80 border border-white/10 pointer-events-auto shadow-2xl">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              className={`flex flex-col items-center justify-center gap-1 w-20 h-16 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className={`transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''}`}>
                {tab.icon}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-widest">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

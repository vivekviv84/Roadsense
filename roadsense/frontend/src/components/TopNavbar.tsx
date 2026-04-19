import { Car, LayoutDashboard, Map as MapIcon, Settings } from 'lucide-react'

export type TabKey = 'dashboard' | 'navigation' | 'info'

type Props = {
  activeTab: TabKey
  onSelect: (tab: TabKey) => void
}

export function TopNavbar({ activeTab, onSelect }: Props) {
  const tabs: { key: TabKey; icon: any; label: string }[] = [
    { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { key: 'navigation', icon: MapIcon, label: 'Navigation' },
    { key: 'info', icon: Car, label: 'Information' },
  ]

  return (
    <nav className="flex shrink-0 items-center justify-between border-b dark:border-slate-800 border-slate-200 dark:bg-slate-950 bg-white px-6 py-3 shadow-sm dark:shadow-none transition-colors duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-500">
          <Car size={18} />
        </div>
        <span className="text-lg font-bold tracking-wide dark:text-slate-100 text-slate-800">RoadSense</span>
      </div>

      <div className="flex gap-2 rounded-full border dark:border-slate-800 border-slate-200 dark:bg-black/40 bg-slate-50 p-1">
        {tabs.map((t) => {
          const active = activeTab === t.key
          console.log(`Rendering tab ${t.key}, active:`, active)
          return (
            <button
              key={t.key}
              onClick={() => {
                console.log('Tab clicked:', t.key)
                onSelect(t.key)
              }}
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-300 ${
                active
                  ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                  : 'dark:text-slate-400 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 dark:hover:text-slate-200 hover:text-slate-800'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        {/* Placeholder for status / settings */}
        <button className="flex h-10 w-10 items-center justify-center rounded-full border dark:border-white/5 border-slate-200 dark:bg-white/5 bg-slate-50 dark:text-slate-300 text-slate-500 transition hover:bg-slate-200 dark:hover:bg-white/10 dark:hover:text-white">
          <Settings size={18} />
        </button>
      </div>
    </nav>
  )
}

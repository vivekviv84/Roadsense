import { Phone, Settings, Activity, Video } from 'lucide-react'

export function DashboardHomeView() {
  const actions = [
    { type: 'link', href: 'https://youtube.com', target: '_blank', id: 'youtube', label: 'YouTube', icon: Video, 
      color: 'dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 bg-red-50 text-red-600 border-red-200' },
    { type: 'link', href: 'tel:0000000000', id: 'phone', label: 'Phone Call', icon: Phone, 
      color: 'dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20 bg-green-50 text-green-600 border-green-200' },
    { type: 'button', id: 'settings', label: 'Settings', icon: Settings, 
      color: 'dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20 bg-slate-50 text-slate-600 border-slate-200' },
    { type: 'button', id: 'status', label: 'System Status', icon: Activity, 
      color: 'dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 bg-blue-50 text-blue-600 border-blue-200' },
  ]

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-8 dark:bg-[#05070a] bg-slate-100 transition-colors duration-500">
      {/* Center Car Visualization */}
      <div className="relative mb-16 flex items-center justify-center">
        {/* Decorative backdrop glow */}
        <div className="absolute inset-0 scale-150 rounded-full bg-blue-500/10 blur-[100px]" />
        
        <div className="relative h-64 w-[32rem] max-w-full rounded-[2rem] border dark:border-white/5 border-slate-200 dark:bg-gradient-to-t dark:from-slate-900 dark:to-black/40 bg-white shadow-2xl dark:shadow-blue-500/5 overflow-hidden flex items-center justify-center transition-colors duration-500">
          {/* We use an img if present, failing that a styled placeholder */}
          <div className="text-center">
             <img src="/car.png" alt="Ego Vehicle" className="h-48 object-contain drop-shadow-2xl mx-auto" onError={(e) => {
                // fallback if image isn't available
                ;(e.target as HTMLImageElement).style.display = 'none';
             }} />
             <p className="mt-4 text-xs font-medium tracking-widest dark:text-slate-500 text-slate-400 uppercase">System Ready</p>
          </div>
        </div>
      </div>

      {/* 2x2 Action Button Grid */}
      <div className="grid w-full max-w-2xl grid-cols-2 gap-6">
        {actions.map((action) => {
          const className = `group flex flex-col items-center justify-center gap-4 rounded-3xl border dark:bg-[#0a0d14] bg-white p-8 shadow-lg dark:backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl dark:hover:bg-[#111622] hover:bg-slate-50 ${action.color}`
          if (action.type === 'link') {
            return (
              <a key={action.id} href={action.href} target={action.target} className={className}>
                <action.icon size={36} className="transition-transform group-hover:scale-110" />
                <span className="text-lg font-semibold dark:text-slate-200 text-slate-700">{action.label}</span>
              </a>
            )
          }
          return (
            <button key={action.id} className={className}>
              <action.icon size={36} className="transition-transform group-hover:scale-110" />
              <span className="text-lg font-semibold dark:text-slate-200 text-slate-700">{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

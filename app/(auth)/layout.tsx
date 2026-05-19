export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-2/5 bg-plum-cta flex-col items-center justify-center p-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-[8px] bg-white/20" />
          <span className="text-white text-xl font-bold">Plum Planner</span>
        </div>
        <p className="text-white/70 text-[15px] text-center max-w-xs leading-relaxed">
          Real-time team scheduling for agencies and creative teams. Calm, clear, in control.
        </p>
      </div>
      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  )
}

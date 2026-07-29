export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8" style={{ background: '#f3f4f6' }}>
      <div className="mb-6 text-[22px] font-medium tracking-tight" style={{ color: '#111827' }}>
        Blog<span style={{ color: '#4f46e5' }}>dy</span>
      </div>
      {children}
    </div>
  )
}

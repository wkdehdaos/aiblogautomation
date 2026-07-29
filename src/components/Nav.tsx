'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Nav() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string | null; email: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { user?: { name: string | null; email: string } }) => {
        if (d.user) setUser(d.user)
      })
      .catch(() => {})
  }, [])

  if (!user) return null

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const displayName = user.name ?? user.email.split('@')[0]

  return (
    <nav
      className="flex shrink-0 items-center justify-between px-5"
      style={{ background: '#4f46e5', height: 'var(--nav-h)' }}
    >
      <Link href="/" className="text-[18px] font-medium tracking-tight text-white">
        Blog<span style={{ color: '#a5b4fc' }}>dy</span>
      </Link>

      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-[13px]" style={{ color: '#c7d2fe' }}>
          {displayName}
        </span>
        <Link
          href="/pricing"
          className="rounded border border-white/20 px-3 py-1 text-[13px] text-white/80 transition hover:border-white/40 hover:text-white"
        >
          요금제
        </Link>
        <Link
          href="/contact"
          className="rounded border border-white/20 px-3 py-1 text-[13px] text-white/80 transition hover:border-white/40 hover:text-white"
        >
          제휴문의
        </Link>
        <button
          onClick={handleLogout}
          className="rounded border border-white/20 px-3 py-1 text-[13px] text-white/80 transition hover:border-white/40 hover:text-white"
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}

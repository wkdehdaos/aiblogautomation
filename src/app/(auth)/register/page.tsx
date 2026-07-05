'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as { ok?: boolean; error?: string }

    if (data.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError(data.error ?? '회원가입에 실패했습니다.')
    }
    setLoading(false)
  }

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">회원가입</h1>
        <p className="mt-1 text-sm text-gray-500">새 계정을 만드세요</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            이름 <span className="text-xs font-normal text-gray-400">(선택)</span>
          </label>
          <input
            type="text"
            className={inputClass}
            placeholder="홍길동"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">이메일</label>
          <input
            type="email"
            required
            className={inputClass}
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">비밀번호</label>
          <input
            type="password"
            required
            minLength={8}
            className={inputClass}
            placeholder="8자 이상"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-60"
        >
          {loading ? '처리 중...' : '회원가입'}
        </button>

        <p className="text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </div>
  )
}

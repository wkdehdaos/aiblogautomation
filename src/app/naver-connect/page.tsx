'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function NaverConnectPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [form, setForm] = useState({ naverId: '', naverPassword: '' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/naver/status')
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => setConnected(!!d.connected))
      .catch(() => setConnected(false))
  }, [])

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/naver/start-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setConnected(true)
        setForm({ naverId: '', naverPassword: '' })
        setMessage({ type: 'success', text: '네이버 계정이 연결됐습니다.' })
      } else {
        setMessage({ type: 'error', text: data.error ?? '연결에 실패했습니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('네이버 계정 연결을 해제하시겠습니까?')) return
    setLoading(true)
    setMessage(null)
    try {
      await fetch('/api/naver/disconnect', { method: 'POST' })
      setConnected(false)
      setMessage({ type: 'success', text: '연결이 해제됐습니다.' })
    } catch {
      setMessage({ type: 'error', text: '해제 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link href="/" className="text-sm text-indigo-500 hover:underline">
            ← 메인으로
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">네이버 계정 연결</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            블로그 자동 발행을 위해 네이버 계정을 연결해주세요.
          </p>
        </div>

        {/* 연결 상태 표시 */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">연결 상태</p>
          {connected === null ? (
            <p className="text-sm text-gray-400">확인 중...</p>
          ) : connected ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                네이버 계정 연결됨
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="text-xs font-medium text-gray-400 hover:text-red-500 transition disabled:opacity-50"
              >
                연결 해제
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-600">
              <span className="flex h-2 w-2 rounded-full bg-amber-400" />
              미연결
            </span>
          )}
        </div>

        {/* 알림 메시지 */}
        {message && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 로그인 폼 (미연결 상태에서만 표시) */}
        {connected === false && (
          <form onSubmit={handleConnect} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-4">
            <h2 className="text-base font-semibold text-gray-800">네이버 계정으로 연결하기</h2>

            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 ring-1 ring-amber-200">
              입력한 계정 정보는 로그인에만 사용되며 서버에 저장되지 않습니다.
              로그인 세션만 암호화되어 저장됩니다.
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">네이버 아이디</label>
              <input
                type="text"
                required
                autoComplete="username"
                className={inputClass}
                placeholder="아이디 입력"
                value={form.naverId}
                onChange={(e) => setForm((p) => ({ ...p, naverId: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className={inputClass}
                placeholder="비밀번호 입력"
                value={form.naverPassword}
                onChange={(e) => setForm((p) => ({ ...p, naverPassword: e.target.value }))}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#03C75A] py-3 text-sm font-semibold text-white transition hover:bg-[#02b351] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  로그인 중... (최대 30초)
                </span>
              ) : (
                '네이버 계정 연결하기'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

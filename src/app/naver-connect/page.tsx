'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

function formatDaysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '1일 전'
  return `${diff}일 전`
}

function formatExpiry(isoStr: string): string {
  const mins = Math.floor((new Date(isoStr).getTime() - Date.now()) / 60000)
  if (mins <= 0) return '만료됨'
  return `${mins}분 후 만료`
}

export default function NaverConnectPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [copied, setCopied] = useState<'token' | null>(null)
  const [polling, setPolling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchStatus = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/naver/status')
      const d = await res.json() as { connected?: boolean; sessionUploadedAt?: string | null }
      setConnected(!!d.connected)
      setUploadedAt(d.sessionUploadedAt ?? null)
      return !!d.connected
    } catch {
      setConnected(false)
      return false
    }
  }

  useEffect(() => { fetchStatus() }, [])

  // exe 실행 후 자동 감지 폴링
  useEffect(() => {
    if (!polling) return
    pollRef.current = setInterval(async () => {
      const ok = await fetchStatus()
      if (ok) {
        setPolling(false)
        setMessage({ type: 'success', text: '✅ 네이버 연결이 완료됐습니다!' })
      }
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [polling])

  const daysAgo = uploadedAt
    ? Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86400000)
    : null
  const isStale = daysAgo !== null && daysAgo >= 14

  // ── 핸들러 ────────────────────────────────────────────────────────

  const handleGetToken = async () => {
    setTokenLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/naver/upload-token')
      const d = await res.json() as { token?: string; expiresAt?: string; error?: string }
      if (d.token) {
        setToken(d.token)
        setTokenExpiresAt(d.expiresAt ?? null)
      } else {
        setMessage({ type: 'error', text: d.error ?? '토큰 생성 실패' })
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류가 발생했습니다.' })
    } finally {
      setTokenLoading(false)
    }
  }

  const handleCopyToken = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied('token')
    setTimeout(() => setCopied(null), 2000)
  }

  const handleDisconnect = async () => {
    if (!confirm('네이버 계정 연결을 해제하시겠습니까?')) return
    setLoading(true)
    try {
      await fetch('/api/naver/disconnect', { method: 'POST' })
      setConnected(false)
      setUploadedAt(null)
      setToken(null)
      setMessage({ type: 'success', text: '연결이 해제됐습니다.' })
    } catch {
      setMessage({ type: 'error', text: '해제 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMessage(null)
    try {
      const text = await file.text()
      let sessionData: unknown
      try { sessionData = JSON.parse(text) } catch {
        setMessage({ type: 'error', text: '올바른 JSON 파일이 아닙니다.' }); return
      }
      const res = await fetch('/api/naver/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionData }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setConnected(true)
        setUploadedAt(new Date().toISOString())
        setMessage({ type: 'success', text: '세션이 업로드됐습니다.' })
      } else {
        setMessage({ type: 'error', text: data.error ?? '업로드 실패' })
      }
    } catch {
      setMessage({ type: 'error', text: '파일 읽기 오류' })
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── 렌더 ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/" className="inline-block text-sm text-indigo-500 hover:underline">← 메인으로</Link>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">네이버 계정 연결</h1>
          <p className="mt-1 text-sm text-gray-500">전용 프로그램으로 간편하게 연결하세요.</p>
        </div>

        {/* 연결 상태 */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">현재 상태</p>
          {connected === null ? (
            <p className="text-sm text-gray-400">확인 중...</p>
          ) : connected ? (
            <div className="flex items-center justify-between">
              <div>
                <span className={`flex items-center gap-2 text-sm font-semibold ${isStale ? 'text-amber-600' : 'text-emerald-600'}`}>
                  <span className={`h-2 w-2 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  {isStale ? '세션 갱신 권장' : '네이버 연결됨'}
                </span>
                {uploadedAt && (
                  <p className="mt-0.5 text-xs text-gray-400 pl-4">
                    {formatDaysAgo(uploadedAt)} 업로드{isStale ? ' — 14일 이상 경과' : ''}
                  </p>
                )}
              </div>
              <button type="button" onClick={handleDisconnect} disabled={loading}
                className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-50">
                연결 해제
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> 미연결
            </span>
          )}
        </div>

        {/* 알림 */}
        {message && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 3단계 연결 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">
            {connected && !isStale ? '세션 갱신하기' : '전용 프로그램으로 연결'}
          </h2>

          {/* ① 프로그램 다운로드 */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">1</span>
              프로그램 다운로드
            </p>
            <a href="https://github.com/wkdehdaos/aiblogautomation/releases/download/v1.0.2/naver-login-setup.exe"
              download="naver-login-setup.exe"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 active:scale-[0.98]">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              naver-login-setup.exe 다운로드
            </a>
          </div>

          <div className="border-t border-gray-100" />

          {/* ② 내 토큰 복사 */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">2</span>
              내 토큰 복사
              {tokenExpiresAt && token && (
                <span className="ml-auto text-xs text-gray-400">{formatExpiry(tokenExpiresAt)}</span>
              )}
            </p>

            {token ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                  <code className="flex-1 truncate text-xs font-mono text-slate-700">{token}</code>
                  <button type="button" onClick={handleCopyToken}
                    className="shrink-0 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-600">
                    {copied === 'token' ? '복사됨 ✓' : '복사'}
                  </button>
                </div>
                <button type="button" onClick={handleGetToken} disabled={tokenLoading}
                  className="w-full text-center text-xs text-gray-400 hover:text-indigo-500 transition">
                  토큰 재발급
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleGetToken} disabled={tokenLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-60">
                {tokenLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    생성 중...
                  </>
                ) : '내 토큰 생성 및 복사'}
              </button>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ③ 프로그램 실행 안내 */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">3</span>
              프로그램 실행 후 토큰 붙여넣기
            </p>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 text-sm text-slate-600 space-y-1.5">
              <p>1. 설치된 <code className="rounded bg-slate-200 px-1.5 text-xs font-mono">네이버 연결</code> 프로그램 실행</p>
              <p>2. 위에서 복사한 토큰 붙여넣기 후 시작</p>
              <p>3. 열리는 브라우저에서 네이버 로그인</p>
              <p>4. 로그인 완료 시 자동으로 연결됨</p>
            </div>

            {polling ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-indigo-50 py-3 text-sm text-indigo-600 ring-1 ring-indigo-200">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                연결 대기 중... (완료되면 자동 업데이트)
              </div>
            ) : (
              <button type="button" onClick={() => { setPolling(true); setMessage(null) }}
                className="w-full rounded-xl border border-indigo-200 py-2.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50">
                프로그램을 실행했어요 (자동 감지 시작)
              </button>
            )}
          </div>
        </div>

        {/* 대안: 파일 직접 업로드 */}
        <details className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-gray-500 hover:text-gray-700">
            대안: naver-session.json 직접 업로드
          </summary>
          <div className="px-6 pb-5 space-y-3">
            <p className="text-xs text-gray-400">
              터미널에서 <code className="rounded bg-gray-100 px-1.5 font-mono">npm run naver-login</code> 실행 후 생성된 파일을 업로드하세요.
            </p>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            <button type="button" disabled={loading} onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-sm text-gray-500 transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60">
              {loading ? '업로드 중...' : 'naver-session.json 선택'}
            </button>
          </div>
        </details>
      </div>
    </div>
  )
}

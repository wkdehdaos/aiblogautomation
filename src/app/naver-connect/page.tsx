'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

function formatDaysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '1일 전'
  return `${diff}일 전`
}

export default function NaverConnectPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async () => {
    const res = await fetch('/api/naver/status')
    const d = await res.json() as { connected?: boolean; sessionUploadedAt?: string | null }
    setConnected(!!d.connected)
    setUploadedAt(d.sessionUploadedAt ?? null)
    return !!d.connected
  }

  useEffect(() => {
    fetchStatus().catch(() => setConnected(false))
  }, [])

  // 프로그램 실행 중 폴링
  useEffect(() => {
    if (!polling) return
    pollRef.current = setInterval(async () => {
      try {
        const isConnected = await fetchStatus()
        if (isConnected) {
          setPolling(false)
          setMessage({ type: 'success', text: '✅ 네이버 연결이 완료됐습니다!' })
        }
      } catch { /* 무시 */ }
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [polling])

  const daysAgo = uploadedAt
    ? Math.floor((Date.now() - new Date(uploadedAt).getTime()) / 86400000)
    : null
  const isStale = daysAgo !== null && daysAgo >= 14

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setMessage(null)
    setLoading(true)
    try {
      const text = await file.text()
      let sessionData: unknown
      try { sessionData = JSON.parse(text) } catch {
        setMessage({ type: 'error', text: '올바른 JSON 파일이 아닙니다.' })
        return
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
        setMessage({ type: 'success', text: '세션이 업로드됐습니다. 이제 블로그에 발행할 수 있어요.' })
      } else {
        setMessage({ type: 'error', text: data.error ?? '업로드에 실패했습니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '파일을 읽는 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('네이버 계정 연결을 해제하시겠습니까?')) return
    setLoading(true)
    setMessage(null)
    try {
      await fetch('/api/naver/disconnect', { method: 'POST' })
      setConnected(false)
      setUploadedAt(null)
      setFileName(null)
      setMessage({ type: 'success', text: '연결이 해제됐습니다.' })
    } catch {
      setMessage({ type: 'error', text: '해제 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const startPolling = () => {
    setPolling(true)
    setMessage(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link href="/" className="text-sm text-indigo-500 hover:underline">← 메인으로</Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">네이버 계정 연결</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            프로그램을 실행하거나 세션 파일을 업로드해 연결하세요.
          </p>
        </div>

        {/* 연결 상태 */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">현재 연결 상태</p>
          {connected === null ? (
            <p className="text-sm text-gray-400">확인 중...</p>
          ) : connected ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                {isStale ? (
                  <span className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    세션 갱신 권장
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    네이버 연결됨
                  </span>
                )}
                <button type="button" onClick={handleDisconnect} disabled={loading}
                  className="text-xs text-gray-400 transition hover:text-red-500 disabled:opacity-50">
                  연결 해제
                </button>
              </div>
              {uploadedAt && (
                <p className="text-xs text-gray-400">
                  마지막 업로드: {formatDaysAgo(uploadedAt)}
                  {isStale && ' — 갱신을 권장해요'}
                </p>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              미연결
            </span>
          )}
        </div>

        {/* 알림 메시지 */}
        {message && (
          <div className={`mb-5 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* ── 방법 1: 전용 프로그램 (권장) ── */}
        <div className="mb-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-600">권장</span>
            <h2 className="text-base font-semibold text-gray-800">전용 프로그램으로 연결</h2>
          </div>

          {/* 안내 */}
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">사용 방법</p>
            <ol className="space-y-2">
              {[
                '아래 버튼으로 프로그램 다운로드',
                '다운로드한 naver-login.exe 실행',
                '이 사이트 계정(이메일/비밀번호) 입력',
                '열리는 브라우저에서 네이버 로그인',
                '자동으로 연결 완료',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* 다운로드 버튼 */}
          <a
            href="/downloads/naver-login.exe"
            download="naver-login.exe"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            naver-login.exe 다운로드
          </a>

          {/* 실행 후 자동 감지 */}
          {polling ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-indigo-50 py-3 text-sm text-indigo-600 ring-1 ring-indigo-200">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              프로그램 실행 대기 중... (연결되면 자동으로 업데이트돼요)
            </div>
          ) : (
            <button type="button" onClick={startPolling}
              className="w-full rounded-xl border border-indigo-200 py-2.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50">
              프로그램을 실행했어요 (자동 감지 시작)
            </button>
          )}
        </div>

        {/* ── 방법 2: 파일 직접 업로드 ── */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">직접 파일 업로드</h2>

          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">수동 업로드 방법</p>
            <ol className="space-y-2">
              {[
                <>VS Code 터미널에서 <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono">npm run naver-login</code> 실행</>,
                '뜨는 브라우저에서 네이버 로그인',
                <>생성된 <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono">naver-session.json</code> 업로드</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button type="button" disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-4 text-sm font-medium text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                업로드 중...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {fileName ?? 'naver-session.json 선택'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

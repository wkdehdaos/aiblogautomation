'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function NaverConnectPage() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/naver/status')
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => setConnected(!!d.connected))
      .catch(() => setConnected(false))
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setMessage(null)
    setLoading(true)

    try {
      const text = await file.text()
      let sessionData: unknown
      try {
        sessionData = JSON.parse(text)
      } catch {
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
      setFileName(null)
      setMessage({ type: 'success', text: '연결이 해제됐습니다.' })
    } catch {
      setMessage({ type: 'error', text: '해제 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-10 px-4">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link href="/" className="text-sm text-indigo-500 hover:underline">
            ← 메인으로
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">네이버 세션 연결</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            로컬에서 발급받은 세션 파일을 업로드해 블로그 발행을 활성화해주세요.
          </p>
        </div>

        {/* 연결 상태 */}
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">연결 상태</p>
          {connected === null ? (
            <p className="text-sm text-gray-400">확인 중...</p>
          ) : connected ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                세션 연결됨
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="text-xs font-medium text-gray-400 transition hover:text-red-500 disabled:opacity-50"
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

        {/* 업로드 섹션 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">세션 파일 업로드</h2>

          {/* 사용 방법 안내 */}
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">사용 방법</p>
            <ol className="space-y-1.5 text-sm text-slate-600 list-decimal list-inside">
              <li>로컬 컴퓨터에서 아래 명령어 실행</li>
              <li>
                <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-800">
                  npm run naver-login
                </code>
              </li>
              <li>브라우저에서 네이버 로그인 완료</li>
              <li>생성된 <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-mono text-slate-800">naver-session.json</code> 업로드</li>
            </ol>
          </div>

          {/* 파일 업로드 버튼 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 py-5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
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
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {fileName ?? 'naver-session.json 업로드'}
                </>
              )}
            </button>
          </div>

          {connected && (
            <p className="text-center text-xs text-gray-400">
              세션이 만료되면 위 과정을 반복해 다시 업로드해주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

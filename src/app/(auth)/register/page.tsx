'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const TIMER_SECONDS = 5 * 60

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [betaFull, setBetaFull] = useState(false)
  const [betaLoading, setBetaLoading] = useState(true)
  const [betaWaitlistEmail, setBetaWaitlistEmail] = useState('')
  const [betaWaitlistSubmitting, setBetaWaitlistSubmitting] = useState(false)
  const [betaWaitlistDone, setBetaWaitlistDone] = useState(false)

  const [codeInput, setCodeInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [verified, setVerified] = useState(false)
  const [smsLoading, setSmsLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [smsError, setSmsError] = useState('')
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    fetch('/api/beta/status')
      .then(r => r.json())
      .then((d: { isFull: boolean }) => { setBetaFull(d.isFull); setBetaLoading(false) })
      .catch(() => setBetaLoading(false))
  }, [])

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimer(TIMER_SECONDS)
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0 }
        return t - 1
      })
    }, 1000)
  }

  function formatTimer(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  async function handleBetaWaitlist() {
    setBetaWaitlistSubmitting(true)
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: betaWaitlistEmail }),
      })
      setBetaWaitlistDone(true)
    } finally {
      setBetaWaitlistSubmitting(false)
    }
  }

  async function handleSendSms() {
    setSmsError('')
    setSmsLoading(true)
    const res = await fetch('/api/auth/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: form.phone }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    setSmsLoading(false)
    if (data.ok) {
      setCodeSent(true)
      setCodeInput('')
      setVerified(false)
      startTimer()
    } else {
      setSmsError(data.error ?? '발송에 실패했습니다.')
    }
  }

  async function handleVerify() {
    setSmsError('')
    setVerifyLoading(true)
    const res = await fetch('/api/auth/verify-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: form.phone, code: codeInput }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    setVerifyLoading(false)
    if (data.ok) {
      setVerified(true)
      if (timerRef.current) clearInterval(timerRef.current)
    } else {
      setSmsError(data.error ?? '인증에 실패했습니다.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verified) { setError('휴대폰 인증을 완료해주세요.'); return }
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

  if (betaLoading) {
    return (
      <div className="w-full max-w-sm flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (betaFull) {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">블로디(Blogdy)</h1>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 space-y-4 text-center">
          <p className="text-3xl">😢</p>
          <h2 className="text-lg font-bold text-gray-900">베타 테스트 인원이 마감됐어요.</h2>
          <p className="text-sm text-gray-500">
            이메일을 남겨주시면 정식 오픈 시 가장 먼저 알려드릴게요!
          </p>
          {betaWaitlistDone ? (
            <p className="font-semibold text-green-600">등록 완료! 정식 오픈 시 알림을 드릴게요. 🎉</p>
          ) : (
            <>
              <input
                type="email"
                value={betaWaitlistEmail}
                onChange={e => setBetaWaitlistEmail(e.target.value)}
                placeholder="이메일 입력"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
              />
              <button
                onClick={handleBetaWaitlist}
                disabled={!betaWaitlistEmail || betaWaitlistSubmitting}
                className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
              >
                {betaWaitlistSubmitting ? '등록 중...' : '대기자 등록하기'}
              </button>
            </>
          )}
          <Link href="/login" className="block text-sm text-indigo-500 hover:underline">
            이미 계정이 있으신가요? 로그인
          </Link>
        </div>
      </div>
    )
  }

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

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">휴대폰 번호</label>
          <div className="flex gap-2">
            <input
              type="tel"
              required
              className={inputClass}
              placeholder="01012345678"
              value={form.phone}
              disabled={verified}
              onChange={(e) => {
                setForm((p) => ({ ...p, phone: e.target.value }))
                setCodeSent(false)
                setVerified(false)
                setSmsError('')
              }}
            />
            <button
              type="button"
              onClick={handleSendSms}
              disabled={smsLoading || verified || !form.phone}
              className="shrink-0 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
            >
              {smsLoading ? '발송 중' : codeSent ? '재발송' : '인증번호 받기'}
            </button>
          </div>

          {codeSent && !verified && (
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={inputClass + ' pr-14'}
                  placeholder="인증번호 6자리"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                />
                {timer > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-red-500">
                    {formatTimer(timer)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifyLoading || codeInput.length !== 6 || timer === 0}
                className="shrink-0 rounded-lg bg-gray-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {verifyLoading ? '확인 중' : '확인'}
              </button>
            </div>
          )}

          {verified && (
            <p className="mt-2 text-sm font-medium text-green-600">인증 완료</p>
          )}

          {smsError && (
            <p className="mt-1.5 text-xs text-red-500">{smsError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !verified}
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

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BETA_LIMIT, PLANS, type Plan } from '@/lib/plans'

interface BetaStatus {
  betaCount: number
  plan: Plan
}

export default function PricingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<BetaStatus | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<Plan | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const portoneRef = useRef<typeof import('@portone/browser-sdk/v2') | null>(null)

  useEffect(() => {
    import('@portone/browser-sdk/v2').then((m) => { portoneRef.current = m })
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { user?: { betaCount?: number; plan?: Plan; email?: string; name?: string } }) => {
        if (d.user) {
          setLoggedIn(true)
          setUserEmail(d.user.email ?? '')
          setUserName(d.user.name ?? '')
          setStatus({ betaCount: d.user.betaCount ?? 0, plan: d.user.plan ?? 'free' })
        } else {
          setStatus({ betaCount: 0, plan: 'free' })
        }
      })
      .catch(() => setStatus({ betaCount: 0, plan: 'free' }))
      .finally(() => setLoading(false))
  }, [])

  async function handlePayment(plan: 'basic' | 'pro') {
    if (!loggedIn) {
      router.push('/login?from=/pricing')
      return
    }
    const PortOne = portoneRef.current
    if (!PortOne) return

    setPaying(plan)
    setMessage(null)
    const planInfo = PLANS[plan]
    const paymentId = `blogdy-${plan}-${Date.now()}`

    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY
    if (!storeId || !channelKey) {
      setMessage({ type: 'error', text: '결제 설정이 올바르지 않습니다. 관리자에게 문의해주세요.' })
      setPaying(null)
      return
    }

    try {
      const response = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId,
        orderName: `블로디(Blogdy) ${planInfo.label} 플랜`,
        totalAmount: planInfo.price,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: {
          email: userEmail,
          fullName: userName || undefined,
        },
      })

      if (response?.code) {
        setMessage({ type: 'error', text: response.message ?? '결제가 취소되었습니다.' })
        return
      }

      const confirmRes = await fetch('/api/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, plan, expectedAmount: planInfo.price }),
      })
      const data = await confirmRes.json() as { ok?: boolean; error?: string }

      if (data.ok) {
        setMessage({ type: 'success', text: `${planInfo.label} 플랜이 활성화됐습니다.` })
        fetch('/api/auth/me')
          .then(r => r.json())
          .then((d: { user?: { betaCount?: number; plan?: Plan } }) => {
            setStatus({ betaCount: d.user?.betaCount ?? 0, plan: d.user?.plan ?? 'free' })
          })
          .catch(() => {})
      } else {
        setMessage({ type: 'error', text: data.error ?? '결제 확인 중 오류가 발생했습니다.' })
      }
    } catch (err) {
      console.error('[payment error]', err)
      const msg = err instanceof Error ? err.message : String(err)
      setMessage({ type: 'error', text: `결제 중 오류가 발생했습니다. (${msg})` })
    } finally {
      setPaying(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
        <svg className="h-8 w-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  const used = status?.betaCount ?? 0
  const remaining = Math.max(0, BETA_LIMIT - used)
  const currentPlan = status?.plan ?? 'free'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">

        <div className="mb-2">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-indigo-500"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </button>
        </div>

        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-sm font-semibold text-orange-600 ring-1 ring-orange-200">
            🚀 베타 테스트 진행 중
          </div>
          <h1 className="text-2xl font-bold text-gray-900">요금제 선택</h1>
          <p className="mt-2 text-sm text-gray-500">
            베타 기간 동안 <strong className="text-indigo-600">{BETA_LIMIT}회</strong> 무료, 이후 유료 플랜으로 전환하세요.
          </p>
        </div>

        {message && (
          <div className={`mb-6 rounded-xl px-4 py-3 text-sm text-center font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
              : 'bg-red-50 text-red-700 ring-1 ring-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* 무료 카드 */}
          <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ${currentPlan === 'free' ? 'ring-indigo-300' : 'ring-gray-100'}`}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">무료</div>
            <div className="mb-1 text-3xl font-bold text-gray-900">무료</div>
            <p className="mb-4 text-xs text-gray-400">베타 테스트 기간 한정</p>

            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>사용량</span>
                <span>{used} / {BETA_LIMIT}회</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-indigo-400 transition-all"
                  style={{ width: `${Math.min(100, (used / BETA_LIMIT) * 100)}%` }}
                />
              </div>
              {remaining > 0
                ? <p className="mt-1 text-xs text-indigo-500">잔여 {remaining}회</p>
                : <p className="mt-1 text-xs text-orange-500">횟수 소진</p>
              }
            </div>

            <ul className="mb-6 space-y-1.5">
              {[`AI 블로그 작성 ${BETA_LIMIT}회`, '네이버 블로그 발행', '사진 모자이크'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="h-3.5 w-3.5 shrink-0 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => router.push('/')}
              className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
            >
              {currentPlan === 'free' ? '현재 플랜' : '무료로 시작'}
            </button>
          </div>

          {/* 베이직 카드 */}
          <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ${currentPlan === 'basic' ? 'ring-indigo-400 ring-2' : 'ring-indigo-200'}`}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-500">베이직</div>
            <div className="mb-1 text-3xl font-bold text-gray-900">9,900<span className="text-base font-normal text-gray-400">원/월</span></div>
            <p className="mb-4 text-xs text-gray-400">월 30회 블로그 작성</p>

            <ul className="mb-6 space-y-1.5">
              {['AI 블로그 작성 30회/월', '네이버 블로그 발행', '사진 모자이크', 'SEO 최적화'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="h-3.5 w-3.5 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePayment('basic')}
              disabled={paying !== null || currentPlan === 'basic'}
              className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 transition shadow-md shadow-indigo-200 disabled:opacity-60"
            >
              {paying === 'basic' ? '결제 중...' : currentPlan === 'basic' ? '현재 플랜' : '베이직 시작하기'}
            </button>
          </div>

          {/* 프로 카드 */}
          <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ${currentPlan === 'pro' ? 'ring-violet-400 ring-2' : 'ring-violet-200'} relative`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-violet-500 px-3 py-1 text-xs font-bold text-white shadow">인기</span>
            </div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-500">프로</div>
            <div className="mb-1 text-3xl font-bold text-gray-900">29,900<span className="text-base font-normal text-gray-400">원/월</span></div>
            <p className="mb-4 text-xs text-gray-400">무제한 블로그 작성</p>

            <ul className="mb-6 space-y-1.5">
              {['AI 블로그 작성 무제한', '네이버 블로그 발행', '사진 모자이크', 'SEO 최적화', '우선 지원'].map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                  <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePayment('pro')}
              disabled={paying !== null || currentPlan === 'pro'}
              className="w-full rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 transition shadow-md shadow-violet-200 disabled:opacity-60"
            >
              {paying === 'pro' ? '결제 중...' : currentPlan === 'pro' ? '현재 플랜' : '프로 시작하기'}
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          결제 관련 문의:{' '}
          <button onClick={() => router.push('/contact')} className="text-indigo-500 hover:underline">
            제휴 문의
          </button>
        </p>
      </div>
    </div>
  )
}

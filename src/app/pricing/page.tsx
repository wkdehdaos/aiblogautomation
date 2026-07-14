'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import type { Plan } from '@/lib/plans'
import { PLANS } from '@/lib/plans'

interface PlanStatus {
  plan: Plan
  postCount: number
  postLimit: number | null
  planExpiresAt: string | null
  hasBilling: boolean
}

interface UserInfo {
  userId: string
  email: string
  name: string | null
}

function josa(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00
  const jongseong = code >= 0 ? code % 28 : 0
  return jongseong === 0 || jongseong === 8 ? '로' : '으로'
}

const PLAN_FEATURES: Record<Plan, string[]> = {
  free: ['월 3회 글 생성', 'AI 블로그 자동 작성', '네이버 발행'],
  basic: ['월 30회 글 생성', 'AI 블로그 자동 작성', '네이버 발행', '사진 모자이크'],
  pro: ['무제한 글 생성', 'AI 블로그 자동 작성', '네이버 발행', '사진 모자이크', '우선 처리'],
}

export default function PricingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<PlanStatus | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<Plan | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/payment/status').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([planData, meData]: [PlanStatus, { user?: UserInfo }]) => {
      setStatus(planData)
      setUser(meData.user ?? null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async (plan: Plan) => {
    if (plan === 'free' || !user) return
    setUpgrading(plan)
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ''
      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey: user.userId })
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/payment/success?plan=${plan}`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user.email,
        customerName: user.name ?? user.email,
      })
    } catch (err) {
      console.error(err)
      alert('결제 창을 열지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setUpgrading(null)
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

  const currentPlan = status?.plan ?? 'free'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">

        {/* 헤더 */}
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-bold text-gray-900">요금제</h1>
          <p className="mt-2 text-sm text-gray-500">
            AI 블로그 자동 작성 서비스의 플랜을 선택하세요.
          </p>
          {status && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm text-indigo-700 ring-1 ring-indigo-100">
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              현재 플랜: <strong>{PLANS[currentPlan].label}</strong>
              {status.postLimit !== null && (
                <span className="text-indigo-500">
                  · 이번 달 {status.postCount}/{status.postLimit}회 사용
                </span>
              )}
            </div>
          )}
        </div>

        {/* 플랜 카드 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(Object.entries(PLANS) as [Plan, typeof PLANS[Plan]][]).map(([planKey, info]) => {
            const isCurrent = currentPlan === planKey
            const isPro = planKey === 'pro'

            return (
              <div
                key={planKey}
                className={`relative rounded-2xl bg-white p-6 shadow-sm ring-1 transition ${
                  isPro
                    ? 'ring-indigo-400 shadow-indigo-100'
                    : isCurrent
                    ? 'ring-indigo-200'
                    : 'ring-gray-100'
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white shadow">
                      추천
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h2 className="text-base font-bold text-gray-900">{info.label}</h2>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {planKey === 'free' ? '무료' : (
                      <>
                        {info.price.toLocaleString()}
                        <span className="text-sm font-normal text-gray-500">원/월</span>
                      </>
                    )}
                  </p>
                </div>

                <ul className="mb-6 space-y-2">
                  {PLAN_FEATURES[planKey].map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                      <svg className="h-4 w-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-center text-sm font-semibold text-indigo-500">
                    현재 플랜
                  </div>
                ) : planKey === 'free' ? (
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition"
                  >
                    다운그레이드
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(planKey)}
                    disabled={upgrading !== null}
                    className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
                      isPro
                        ? 'bg-indigo-500 hover:bg-indigo-600 shadow-md shadow-indigo-200'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    {upgrading === planKey ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        처리 중...
                      </span>
                    ) : {`${info.label}${josa(info.label)} 업그레이드`}}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* 하단 안내 */}
        <p className="mt-8 text-center text-xs text-gray-400">
          결제는 매월 자동으로 청구됩니다. 언제든지 해지할 수 있습니다.{' '}
          <button onClick={() => router.push('/dashboard')} className="text-indigo-500 hover:underline">
            대시보드에서 관리
          </button>
        </p>
      </div>
    </div>
  )
}

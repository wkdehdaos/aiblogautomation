'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plan, PLANS } from '@/lib/plans'

interface PlanStatus {
  plan: Plan
  postCount: number
  postLimit: number | null
  planExpiresAt: string | null
  hasBilling: boolean
}

interface UserInfo {
  email: string
  name: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [status, setStatus] = useState<PlanStatus | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchData = () => {
    Promise.all([
      fetch('/api/payment/status').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([planData, meData]: [PlanStatus, { user?: UserInfo }]) => {
      setStatus(planData)
      setUser(meData.user ?? null)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleCancel = async () => {
    if (!confirm('구독을 해지하면 즉시 무료 플랜으로 변경됩니다. 계속하시겠습니까?')) return
    setCancelling(true)
    setCancelStatus(null)
    try {
      const res = await fetch('/api/payment/cancel', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setCancelStatus({ type: 'success', message: '구독이 해지됐습니다. 무료 플랜으로 변경됐어요.' })
        fetchData()
      } else {
        setCancelStatus({ type: 'error', message: data.error ?? '해지 중 오류가 발생했습니다.' })
      }
    } catch {
      setCancelStatus({ type: 'error', message: '네트워크 오류가 발생했습니다.' })
    } finally {
      setCancelling(false)
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
  const planInfo = PLANS[currentPlan]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">마이페이지</h1>
          <button
            onClick={() => router.push('/')}
            className="text-sm text-indigo-500 hover:underline"
          >
            ← 홈으로
          </button>
        </div>

        {/* 사용자 정보 */}
        {user && (
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-3 text-base font-semibold text-gray-800">계정 정보</h2>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 font-bold text-sm">
                {(user.name ?? user.email)[0].toUpperCase()}
              </div>
              <div>
                {user.name && <p className="text-sm font-medium text-gray-900">{user.name}</p>}
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
          </section>
        )}

        {/* 현재 플랜 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">현재 플랜</h2>
          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-4 ring-1 ring-indigo-100">
            <div>
              <p className="text-lg font-bold text-indigo-700">{planInfo.label} 플랜</p>
              <p className="mt-0.5 text-sm text-indigo-500">{planInfo.priceLabel}</p>
              {status?.planExpiresAt && (
                <p className="mt-1 text-xs text-indigo-400">
                  다음 결제일: {new Date(status.planExpiresAt).toLocaleDateString('ko-KR')}
                </p>
              )}
            </div>
            {currentPlan !== 'free' && (
              <span className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                구독 중
              </span>
            )}
          </div>
        </section>

        {/* 이번 달 사용량 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">이번 달 사용량</h2>
          {status && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">글 생성 횟수</span>
                <span className="text-sm font-semibold text-gray-900">
                  {status.postCount}
                  {status.postLimit !== null ? ` / ${status.postLimit}회` : ' / 무제한'}
                </span>
              </div>
              {status.postLimit !== null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-indigo-400 transition-all"
                    style={{ width: `${Math.min(100, (status.postCount / status.postLimit) * 100)}%` }}
                  />
                </div>
              )}
              {status.postLimit !== null && status.postCount >= status.postLimit && (
                <p className="mt-3 text-xs text-red-500">
                  이번 달 한도를 모두 사용했습니다. 플랜을 업그레이드하면 더 많이 사용할 수 있어요.
                </p>
              )}
            </>
          )}
        </section>

        {/* 결제 수단 관리 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">플랜 관리</h2>

          {cancelStatus && (
            <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
              cancelStatus.type === 'success'
                ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                : 'bg-red-50 text-red-700 ring-1 ring-red-200'
            }`}>
              {cancelStatus.message}
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/pricing"
              className="flex w-full items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition"
            >
              <span>플랜 변경하기</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {currentPlan !== 'free' && status?.hasBilling && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-3.5 text-sm font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-60"
              >
                <span>{cancelling ? '처리 중...' : '구독 해지하기'}</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {currentPlan !== 'free' && (
            <p className="mt-3 text-xs text-gray-400">
              구독 해지 시 즉시 무료 플랜으로 변경됩니다. 남은 기간에 대한 환불은 제공되지 않습니다.
            </p>
          )}
        </section>

      </div>
    </div>
  )
}

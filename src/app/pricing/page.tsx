'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BETA_LIMIT } from '@/lib/plans'

interface BetaStatus {
  betaCount: number
}

export default function PricingPage() {
  const router = useRouter()
  const [status, setStatus] = useState<BetaStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { user?: { betaCount?: number } }) => {
        setStatus({ betaCount: d.user?.betaCount ?? 0 })
      })
      .catch(() => setStatus({ betaCount: 0 }))
      .finally(() => setLoading(false))
  }, [])

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-lg">

        {/* 헤더 */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-sm font-semibold text-orange-600 ring-1 ring-orange-200">
            🚀 베타 테스트 진행 중
          </div>
          <h1 className="text-2xl font-bold text-gray-900">베타 테스트 중 - 무료 이용</h1>
          <p className="mt-2 text-sm text-gray-500">
            베타 기간 동안 1인당 <strong className="text-indigo-600">{BETA_LIMIT}회</strong> 무료로 이용하실 수 있어요.
          </p>
        </div>

        {/* 베타 카드 */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-indigo-200 text-center">
          <div className="mb-2 text-4xl font-bold text-indigo-600">무료</div>
          <p className="text-sm text-gray-500 mb-6">베타 테스트 기간 한정</p>

          {/* 사용량 표시 */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>사용량</span>
              <span className="font-semibold">{used} / {BETA_LIMIT}회</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100">
              <div
                className="h-2.5 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(100, (used / BETA_LIMIT) * 100)}%` }}
              />
            </div>
            {remaining > 0 ? (
              <p className="mt-2 text-sm text-indigo-600 font-medium">잔여 {remaining}회 남았어요</p>
            ) : (
              <p className="mt-2 text-sm text-orange-600 font-medium">베타 사용 횟수를 모두 소진했어요</p>
            )}
          </div>

          <ul className="mb-6 space-y-2 text-left">
            {[
              `AI 블로그 자동 작성 ${BETA_LIMIT}회`,
              '네이버 블로그 자동 발행',
              '사진 모자이크 처리',
              'SEO 최적화',
            ].map(feat => (
              <li key={feat} className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="h-4 w-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {feat}
              </li>
            ))}
          </ul>

          <button
            onClick={() => router.push('/')}
            className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition shadow-md shadow-indigo-200"
          >
            블로그 작성하러 가기
          </button>
        </div>

        {/* 안내 */}
        <p className="mt-6 text-center text-xs text-gray-400">
          정식 출시 후 유료 플랜이 제공될 예정입니다.{' '}
          <button
            onClick={() => router.push('/contact')}
            className="text-indigo-500 hover:underline"
          >
            제휴 문의
          </button>
        </p>
      </div>
    </div>
  )
}

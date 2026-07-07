'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plan, PLANS } from '@/lib/plans'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const authKey = searchParams.get('authKey')
    const customerKey = searchParams.get('customerKey')
    const plan = searchParams.get('plan') as Plan | null

    if (!authKey || !customerKey || !plan || !PLANS[plan]) {
      setErrorMsg('잘못된 접근입니다.')
      setStatus('error')
      return
    }

    fetch('/api/payment/billing-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey, plan }),
    })
      .then(async (res) => {
        const data = await res.json() as { ok?: boolean; error?: string }
        if (data.ok) {
          setStatus('success')
        } else {
          setErrorMsg(data.error ?? '결제 처리 중 오류가 발생했습니다.')
          setStatus('error')
        }
      })
      .catch(() => {
        setErrorMsg('네트워크 오류가 발생했습니다.')
        setStatus('error')
      })
  }, [searchParams])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto h-10 w-10 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-4 text-sm text-gray-500">결제를 처리하고 있어요...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">결제 실패</h1>
          <p className="mt-2 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={() => router.push('/pricing')}
            className="mt-6 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition"
          >
            다시 시도하기
          </button>
        </div>
      </div>
    )
  }

  const plan = searchParams.get('plan') as Plan
  const planInfo = PLANS[plan]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg className="h-7 w-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900">결제 완료!</h1>
        <p className="mt-2 text-sm text-gray-500">
          <span className="font-semibold text-indigo-600">{planInfo?.label} 플랜</span>이 활성화됐습니다.
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-6 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition"
        >
          블로그 작성 시작하기
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-2 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          대시보드 보기
        </button>
      </div>
    </div>
  )
}

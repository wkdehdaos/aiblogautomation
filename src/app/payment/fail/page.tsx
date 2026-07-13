'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function PaymentFailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const message = searchParams.get('message') ?? '결제가 취소되었거나 오류가 발생했습니다.'

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <svg className="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-lg font-bold text-gray-900">결제 실패</h1>
      <p className="mt-2 text-sm text-gray-500">{message}</p>
      <button
        onClick={() => router.push('/pricing')}
        className="mt-6 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition"
      >
        다시 시도하기
      </button>
      <button
        onClick={() => router.push('/')}
        className="mt-2 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
      >
        홈으로
      </button>
    </div>
  )
}

export default function PaymentFailPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
      <Suspense>
        <PaymentFailContent />
      </Suspense>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CONTACT_TYPES = ['제휴 문의', '기술 문의', '기타']

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', type: '제휴 문의', content: '' })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setSuccess(true)
      } else {
        setError(data.error ?? '오류가 발생했습니다.')
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200'

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">문의 접수 완료</h1>
          <p className="mt-2 text-sm text-gray-500">문의가 접수됐어요. 빠르게 답변드릴게요!</p>
          <button
            onClick={() => { setSuccess(false); setForm({ name: '', email: '', type: '제휴 문의', content: '' }) }}
            className="mt-6 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition"
          >
            새 문의 작성
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">제휴 및 문의</h1>
          <p className="mt-2 text-sm text-gray-500">궁금한 점이나 제휴 관련 문의를 남겨주세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">이름 <span className="text-red-400">*</span></label>
            <input
              type="text"
              required
              className={inputClass}
              placeholder="홍길동"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">이메일 <span className="text-red-400">*</span></label>
            <input
              type="email"
              required
              className={inputClass}
              placeholder="example@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">문의 유형 <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              {CONTACT_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition ${
                    form.type === t
                      ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">내용 <span className="text-red-400">*</span></label>
            <textarea
              required
              rows={5}
              className={`${inputClass} resize-none`}
              placeholder="문의 내용을 자유롭게 입력해주세요."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 ring-1 ring-red-200">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white hover:bg-indigo-600 transition disabled:opacity-60"
          >
            {submitting ? '제출 중...' : '문의 제출'}
          </button>
        </form>
      </div>
    </div>
  )
}

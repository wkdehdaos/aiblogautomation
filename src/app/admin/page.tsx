import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import BetaConfigPanel from '@/components/BetaConfigPanel'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || session.email !== adminEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">접근 권한이 없습니다.</p>
      </div>
    )
  }

  const [users, feedbacks, contacts, waitlist, betaConfig] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, betaCount: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.feedback.findMany({ include: { user: { select: { email: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.contact.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.waitlist.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.betaConfig.findUnique({ where: { id: 1 } }),
  ])
  const maxUsers = betaConfig?.maxUsers ?? Number(process.env.BETA_MAX_USERS ?? 30)

  const avgRating = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
    : '-'

  const totalBetaUsed = users.reduce((s, u) => s + u.betaCount, 0)

  const fmt = (d: Date) => new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>

        {/* 통계 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: '베타 참여', value: `${users.length}/${maxUsers}명` },
            { label: '베타 총 사용', value: `${totalBetaUsed}회` },
            { label: '평균 별점', value: `${avgRating}★` },
            { label: '대기자 수', value: waitlist.length },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 text-center">
              <p className="text-2xl font-bold text-indigo-600">{s.value}</p>
              <p className="mt-1 text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 피드백 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">피드백 ({feedbacks.length})</h2>
          {feedbacks.length === 0 ? (
            <p className="text-sm text-gray-400">피드백이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {feedbacks.map(f => (
                <div key={f.id} className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-500 font-semibold">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.publishSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {f.publishSuccess ? '발행 성공' : '발행 문제'}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{fmt(f.createdAt)}</span>
                  </div>
                  {f.comment && <p className="mt-2 text-sm text-gray-600">{f.comment}</p>}
                  <p className="mt-1 text-xs text-gray-400">{f.user.email}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 문의 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">문의 ({contacts.length})</h2>
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-400">문의가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {contacts.map(c => (
                <div key={c.id} className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{c.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{c.type}</span>
                    <span className="ml-auto text-xs text-gray-400">{fmt(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{c.email}</p>
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 대기자 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">정식 출시 대기자 ({waitlist.length})</h2>
          {waitlist.length === 0 ? (
            <p className="text-sm text-gray-400">대기자가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {waitlist.map(w => (
                <div key={w.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 ring-1 ring-gray-100">
                  <span className="text-sm text-gray-700">{w.email}</span>
                  <span className="text-xs text-gray-400">{fmt(w.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 가입자 */}
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="mb-4 text-base font-semibold text-gray-800">가입자 ({users.length})</h2>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2.5 ring-1 ring-gray-100">
                <span className="text-sm text-gray-700">{u.email}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-indigo-600 font-medium">베타 {u.betaCount}/{5}회</span>
                  <span className="text-xs text-gray-400">{fmt(u.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

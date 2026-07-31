import Link from 'next/link'

const FEATURES = [
  {
    icon: '✍️',
    title: 'AI 자동 작성',
    desc: '업체명과 정보만 입력하면 AI가 SEO 최적화된 블로그 글을 자동으로 작성해드립니다.',
  },
  {
    icon: '📤',
    title: '네이버 자동 발행',
    desc: '생성된 글을 클릭 한 번으로 네이버 블로그에 바로 발행합니다. 번거로운 복붙 없이.',
  },
  {
    icon: '🖼️',
    title: '사진 자동 삽입',
    desc: '업로드한 사진을 글 내용에 맞게 자동으로 배치하고 얼굴 모자이크도 지원합니다.',
  },
]

const PLANS = [
  {
    name: '무료',
    price: '무료',
    desc: '베타 테스트 기간 한정',
    features: ['AI 블로그 작성 5회', '네이버 블로그 발행', '사진 모자이크'],
    accent: 'gray' as const,
  },
  {
    name: '베이직',
    price: '9,900원/월',
    desc: '월 30회 블로그 작성',
    features: ['AI 블로그 작성 30회/월', '네이버 블로그 발행', '사진 모자이크', 'SEO 최적화'],
    accent: 'indigo' as const,
  },
  {
    name: '프로',
    price: '29,900원/월',
    desc: '무제한 블로그 작성',
    features: ['AI 블로그 작성 무제한', '네이버 블로그 발행', '사진 모자이크', 'SEO 최적화', '우선 지원'],
    accent: 'violet' as const,
    badge: '인기',
  },
]

const CHECK_COLORS = {
  gray: 'text-indigo-300',
  indigo: 'text-indigo-400',
  violet: 'text-violet-400',
}

const BTN_COLORS = {
  gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  indigo: 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-200',
  violet: 'bg-violet-500 text-white hover:bg-violet-600 shadow-md shadow-violet-200',
}

const RING_COLORS = {
  gray: 'ring-gray-100',
  indigo: 'ring-indigo-200',
  violet: 'ring-violet-200',
}

const LABEL_COLORS = {
  gray: 'text-gray-400',
  indigo: 'text-indigo-500',
  violet: 'text-violet-500',
}

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* ── 히어로 ── */}
      <section
        className="px-4 py-24 text-center text-white"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)' }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white/90 ring-1 ring-white/20">
            🚀 베타 테스트 진행 중 — 무료로 시작하세요
          </div>
          <h1 className="mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            블로그 글,<br />이제 30초면 끝
          </h1>
          <p className="mb-10 text-lg text-indigo-200">
            업체 정보만 넣으면 AI가 써드립니다
          </p>
          <Link
            href="/register"
            className="inline-block rounded-xl bg-white px-10 py-4 text-base font-bold text-indigo-600 shadow-xl transition hover:bg-indigo-50"
          >
            무료로 시작하기 →
          </Link>
          <p className="mt-4 text-xs text-indigo-300">신용카드 불필요 · 베타 기간 무료 5회 제공</p>
        </div>
      </section>

      {/* ── 기능 소개 ── */}
      <section className="bg-gray-50 px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-3 text-center text-2xl font-bold text-gray-900">주요 기능</h2>
          <p className="mb-12 text-center text-sm text-gray-400">소상공인을 위한 블로그 마케팅 자동화</p>
          <div className="grid gap-8 md:grid-cols-3">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl bg-white p-7 text-center shadow-sm ring-1 ring-gray-100 transition hover:shadow-md"
              >
                <div className="mb-4 text-4xl">{f.icon}</div>
                <h3 className="mb-2 text-base font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 요금제 ── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-3 text-center text-2xl font-bold text-gray-900">요금제</h2>
          <p className="mb-12 text-center text-sm text-gray-400">
            베타 기간 동안 무료로 사용해보세요
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative rounded-2xl bg-white p-6 shadow-sm ring-1 ${RING_COLORS[plan.accent]}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-violet-500 px-3 py-1 text-xs font-bold text-white shadow">
                      {plan.badge}
                    </span>
                  </div>
                )}
                <div className={`mb-1 text-xs font-semibold uppercase tracking-wide ${LABEL_COLORS[plan.accent]}`}>
                  {plan.name}
                </div>
                <div className="mb-1 text-2xl font-bold text-gray-900">{plan.price}</div>
                <p className="mb-4 text-xs text-gray-400">{plan.desc}</p>
                <ul className="mb-6 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-500">
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 ${CHECK_COLORS[plan.accent]}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition ${BTN_COLORS[plan.accent]}`}
                >
                  무료로 시작하기
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

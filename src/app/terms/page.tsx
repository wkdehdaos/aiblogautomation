import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '이용약관 | 블로디(Blogdy)',
}

const EFFECTIVE_DATE = '2026년 7월 6일'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* 헤더 */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-900">이용약관</h1>
          <p className="mt-1.5 text-sm text-gray-400">시행일: {EFFECTIVE_DATE}</p>
        </div>

        {/* 안내 */}
        <section className="rounded-2xl bg-indigo-50 px-6 py-4 ring-1 ring-indigo-100 text-sm text-indigo-700 leading-relaxed">
          블로디(Blogdy) 서비스(이하 "서비스")를 이용하시기 전에 본 약관을 주의 깊게 읽어 주세요.
          서비스 이용 시 본 약관에 동의한 것으로 간주합니다.
        </section>

        {/* 1. 서비스 목적 */}
        <Card title="1. 서비스 목적">
          <p className="text-sm text-gray-700 leading-relaxed">
            본 서비스는 인공지능(AI) 기술을 활용하여 블로그 글을 자동으로 작성하고,
            네이버 블로그에 발행하는 기능을 제공합니다. 소상공인 및 개인 블로거가
            효율적으로 콘텐츠를 생성하고 관리할 수 있도록 지원하는 것을 목적으로 합니다.
          </p>
        </Card>

        {/* 2. 무료 플랜 */}
        <Card title="2. 무료 플랜 이용 조건">
          <div className="rounded-xl bg-gray-50 px-4 py-3.5 ring-1 ring-gray-100 mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-sm font-bold">
                3
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">월 3회 글 생성 제한</p>
                <p className="text-xs text-gray-500 mt-0.5">무료 플랜은 매월 최대 3회까지 글을 생성할 수 있습니다.</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            생성 횟수는 매월 1일 초기화됩니다. 횟수 초과 시 해당 월의 나머지 기간 동안 글 생성 기능이 제한될 수 있습니다.
          </p>
        </Card>

        {/* 3. 이용 제한 */}
        <Card title="3. 이용 제한 및 금지 행위">
          <p className="mb-3 text-sm text-gray-700 leading-relaxed">
            다음 행위는 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.
          </p>
          <ul className="space-y-2.5 text-sm text-gray-700">
            {[
              {
                title: '타인 계정 무단 사용',
                desc: '본인 소유가 아닌 네이버 계정을 동의 없이 사용하는 행위',
              },
              {
                title: '불법·음란·혐오 콘텐츠 생성',
                desc: '관련 법령 또는 공서양속에 반하는 내용의 글을 생성하거나 발행하는 행위',
              },
              {
                title: '네이버 이용약관 위반',
                desc: '네이버 블로그 서비스 이용약관에 위배되는 방식으로 서비스를 사용하는 행위',
              },
              {
                title: '서비스 자동화 남용',
                desc: '비정상적인 방법으로 생성 제한을 우회하거나 서비스를 과도하게 사용하는 행위',
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 mt-[7px]" />
                <span>
                  <strong className="text-gray-900">{item.title}:</strong>{' '}
                  {item.desc}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* 4. 면책사항 */}
        <Card title="4. 면책사항">
          <div className="rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-100 mb-4 text-xs text-amber-700 leading-relaxed">
            ℹ️ 본 서비스는 네이버 블로그 API를 직접 사용하지 않으며, 서비스 운영 방식 특성상 다음 사항에 대해 책임을 지지 않습니다.
          </div>
          <ul className="space-y-2.5 text-sm text-gray-700">
            {[
              {
                title: '네이버 정책 변경으로 인한 발행 실패',
                desc: '네이버가 서비스 구조나 정책을 변경하여 발행 기능이 동작하지 않게 된 경우',
              },
              {
                title: '네이버 계정 정지',
                desc: '서비스 이용으로 인해 이용자의 네이버 계정이 정지되거나 제한되는 경우',
              },
              {
                title: 'AI 생성 콘텐츠의 정확성',
                desc: 'AI가 생성한 글의 내용이 사실과 다르거나 부적절한 경우',
              },
              {
                title: '서비스 중단',
                desc: '시스템 점검, 천재지변, 외부 API 오류 등으로 인한 일시적 서비스 중단',
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 mt-[7px]" />
                <span>
                  <strong className="text-gray-900">{item.title}:</strong>{' '}
                  {item.desc}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* 5. 지식재산권 */}
        <Card title="5. 지식재산권">
          <p className="text-sm text-gray-700 leading-relaxed">
            서비스를 통해 생성된 블로그 글의 저작권은 이용자에게 있습니다.
            서비스 자체의 소프트웨어, 디자인, 상표 등에 대한 지식재산권은 운영자에게 있으며
            이용자는 이를 무단으로 복제하거나 배포할 수 없습니다.
          </p>
        </Card>

        {/* 6. 약관 변경 */}
        <Card title="6. 약관 변경">
          <p className="text-sm text-gray-700 leading-relaxed">
            운영자는 필요한 경우 본 약관을 변경할 수 있습니다. 변경 사항은 서비스 내 공지사항을 통해
            최소 7일 전 공지하며, 중요 변경의 경우 가입 시 등록한 이메일로 별도 통지합니다.
            변경 이후 서비스를 계속 이용하면 변경된 약관에 동의한 것으로 간주합니다.
          </p>
        </Card>

        {/* 하단 */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <p className="text-xs text-gray-400">본 약관은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
          <Link href="/" className="text-xs font-medium text-indigo-500 hover:underline">
            서비스로 돌아가기
          </Link>
        </div>

      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="mb-4 text-base font-semibold text-gray-800">{title}</h2>
      {children}
    </section>
  )
}

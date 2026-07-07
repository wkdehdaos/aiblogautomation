import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '개인정보처리방침 | AI 블로그 자동 작성',
}

const CONTACT_EMAIL = '[이메일]'
const EFFECTIVE_DATE = '2026년 7월 6일'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 px-4">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* 헤더 */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-900">개인정보처리방침</h1>
          <p className="mt-1.5 text-sm text-gray-400">시행일: {EFFECTIVE_DATE}</p>
        </div>

        {/* 안내 */}
        <section className="rounded-2xl bg-indigo-50 px-6 py-4 ring-1 ring-indigo-100 text-sm text-indigo-700 leading-relaxed">
          AI 블로그 자동 작성 서비스(이하 "서비스")는 이용자의 개인정보를 중요하게 생각합니다.
          본 방침은 수집하는 개인정보의 항목, 이용 목적, 보관 기간 및 이용자의 권리를 안내합니다.
        </section>

        {/* 1. 수집 항목 */}
        <Card title="1. 수집하는 개인정보 항목">
          <Table
            headers={['항목', '수집 방법', '비고']}
            rows={[
              ['이메일 주소', '회원 가입 시 직접 입력', '계정 식별 및 로그인'],
              ['네이버 세션 정보', '로그인 도우미 앱을 통해 수집', 'AES-256-GCM 암호화 저장'],
              ['서비스 이용 기록', '서비스 이용 시 자동 수집', '생성/발행한 글 이력'],
            ]}
          />
          <Note>
            비밀번호는 수집하지 않습니다. 네이버 계정 비밀번호는 서버에 저장되지 않습니다.
          </Note>
        </Card>

        {/* 2. 수집 목적 */}
        <Card title="2. 개인정보 수집 및 이용 목적">
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 mt-[7px]" />
              <span>
                <strong className="text-gray-900">이메일:</strong>{' '}
                회원 가입·로그인, 서비스 이용 내역 관리, 공지 및 문의 답변
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 mt-[7px]" />
              <span>
                <strong className="text-gray-900">네이버 세션:</strong>{' '}
                네이버 블로그 자동 발행 기능 제공 (이외의 목적으로는 사용하지 않습니다)
              </span>
            </li>
          </ul>
        </Card>

        {/* 3. 보관 기간 */}
        <Card title="3. 개인정보 보관 및 파기">
          <Table
            headers={['항목', '보관 기간', '파기 시점']}
            rows={[
              ['이메일 주소', '회원 탈퇴 시까지', '탈퇴 즉시 삭제'],
              ['네이버 세션', '회원 탈퇴 시까지', '탈퇴 즉시 삭제'],
            ]}
          />
          <Note>
            관계 법령에 따라 보존 의무가 있는 정보는 해당 법령에서 정한 기간 동안 보관 후 삭제합니다.
          </Note>
        </Card>

        {/* 4. 제3자 제공 */}
        <Card title="4. 개인정보의 제3자 제공">
          <p className="text-sm text-gray-700 leading-relaxed">
            서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
            단, 법령에 의해 요구되는 경우에는 예외로 합니다.
          </p>
        </Card>

        {/* 5. 보안 조치 */}
        <Card title="5. 개인정보 보호를 위한 기술적 조치">
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              '네이버 세션 정보는 AES-256-GCM 방식으로 암호화하여 서버에 저장합니다.',
              'HTTPS를 통해 데이터를 안전하게 전송합니다.',
              '세션 정보는 블로그 발행 기능 외 다른 목적으로 접근하지 않습니다.',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 mt-[7px]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* 6. 이용자 권리 */}
        <Card title="6. 이용자의 권리">
          <p className="mb-3 text-sm text-gray-700 leading-relaxed">
            이용자는 언제든지 다음 권리를 행사할 수 있습니다.
          </p>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              '개인정보 열람 및 수정 요청',
              '개인정보 삭제(회원 탈퇴) 요청',
              '개인정보 처리 정지 요청',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 mt-[7px]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-gray-500">
            요청은 아래 문의 이메일을 통해 접수하며, 접수 후 영업일 기준 7일 이내 처리합니다.
          </p>
        </Card>

        {/* 7. 문의 */}
        <Card title="7. 개인정보 보호 담당자 및 문의">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3.5 ring-1 ring-gray-100">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">이메일 문의</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </Card>

        {/* 하단 */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <p className="text-xs text-gray-400">본 방침은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
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

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-gray-200 mb-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 text-gray-700 ${j === 0 ? 'font-medium' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 ring-1 ring-amber-100">
      <span className="shrink-0">ℹ️</span>
      <span>{children}</span>
    </p>
  )
}

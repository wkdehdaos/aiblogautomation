import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white py-6 px-4">
      <div className="mx-auto max-w-2xl space-y-3">
        {/* 사업자 정보 */}
        <p className="text-xs text-gray-400 leading-relaxed">
          상호: 블로디(Blogdy)&nbsp;&nbsp;|&nbsp;&nbsp;대표자: 장희섭&nbsp;&nbsp;|&nbsp;&nbsp;
          사업자등록번호: 841-15-02927&nbsp;&nbsp;|&nbsp;&nbsp;
          주소: 경기도 파주시 마음밭길 114&nbsp;&nbsp;|&nbsp;&nbsp;
          전화: 010-6770-9308&nbsp;&nbsp;|&nbsp;&nbsp;
          이메일:{' '}
          <a href="mailto:a01067709308@gmail.com" className="hover:text-indigo-500 transition">
            a01067709308@gmail.com
          </a>
        </p>

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">© 2026 블로디(Blogdy). All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-xs text-gray-400 hover:text-indigo-500 transition">요금제</Link>
            <span className="text-gray-200">|</span>
            <Link href="/contact" className="text-xs text-gray-400 hover:text-indigo-500 transition">제휴 문의</Link>
            <span className="text-gray-200">|</span>
            <Link href="/privacy" className="text-xs text-gray-400 hover:text-indigo-500 transition">개인정보처리방침</Link>
            <span className="text-gray-200">|</span>
            <Link href="/terms" className="text-xs text-gray-400 hover:text-indigo-500 transition">이용약관</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

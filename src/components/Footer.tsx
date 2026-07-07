import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white py-5 px-4">
      <div className="mx-auto max-w-2xl flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p className="text-xs text-gray-400">
          © 2026 AI블로그. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-xs text-gray-400 hover:text-indigo-500 transition"
          >
            요금제
          </Link>
          <span className="text-gray-200">|</span>
          <Link
            href="/privacy"
            className="text-xs text-gray-400 hover:text-indigo-500 transition"
          >
            개인정보처리방침
          </Link>
          <span className="text-gray-200">|</span>
          <Link
            href="/terms"
            className="text-xs text-gray-400 hover:text-indigo-500 transition"
          >
            이용약관
          </Link>
        </div>
      </div>
    </footer>
  )
}

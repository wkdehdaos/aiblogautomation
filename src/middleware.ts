import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/register', '/api/auth/login', '/api/auth/register', '/contact', '/privacy', '/terms']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // API 라우트 및 정적 파일은 그대로 통과
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 세션 검증
  const token = req.cookies.get('session')?.value
  const session = token ? await verifySession(token) : null

  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

export async function POST(req: NextRequest) {
  // 세션 쿠키 또는 Bearer 토큰으로 사용자 확인
  let userId: string

  const jwtSession = await getSession()
  if (jwtSession) {
    userId = jwtSession.userId
  } else {
    const auth = req.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }
    const token = auth.slice(7).trim()
    const user = await prisma.user.findFirst({
      where: {
        uploadToken: token,
        uploadTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    if (!user) {
      return Response.json(
        { error: '토큰이 유효하지 않거나 만료됐습니다. 사이트에서 토큰을 다시 복사하세요.' },
        { status: 401 }
      )
    }
    userId = user.id
    // 사용한 토큰 즉시 무효화 (일회성)
    await prisma.user.update({
      where: { id: userId },
      data: { uploadToken: null, uploadTokenExpiresAt: null },
    })
  }

  try {
    const { session: sessionData } = (await req.json()) as { session: unknown }

    if (!sessionData || typeof sessionData !== 'object') {
      return Response.json({ error: '유효하지 않은 세션 데이터입니다.' }, { status: 400 })
    }

    const data = sessionData as Record<string, unknown>
    if (!Array.isArray(data.cookies) && !Array.isArray(data.origins)) {
      return Response.json(
        { error: 'naver-session.json 형식이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const encrypted = encrypt(JSON.stringify(sessionData))
    await prisma.user.update({
      where: { id: userId },
      data: { naverSession: encrypted, sessionUploadedAt: new Date() },
    })

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[naver/upload-session]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '세션 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

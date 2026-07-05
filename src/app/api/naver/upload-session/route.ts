import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const { session: sessionData } = (await req.json()) as { session: unknown }

    if (!sessionData || typeof sessionData !== 'object') {
      return Response.json({ error: '유효하지 않은 세션 데이터입니다.' }, { status: 400 })
    }

    // Playwright storageState 형식 검증 (cookies 또는 origins 중 하나 이상 존재)
    const data = sessionData as Record<string, unknown>
    if (!Array.isArray(data.cookies) && !Array.isArray(data.origins)) {
      return Response.json(
        { error: 'naver-session.json 형식이 올바르지 않습니다. npm run naver-login으로 다시 생성해주세요.' },
        { status: 400 }
      )
    }

    const encrypted = encrypt(JSON.stringify(sessionData))
    await prisma.user.update({
      where: { id: session.userId },
      data: { naverSession: encrypted },
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

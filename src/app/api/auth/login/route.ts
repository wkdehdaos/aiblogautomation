import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email: string; password: string }

    if (!email || !password) {
      return Response.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return Response.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.password)
    if (!valid) {
      return Response.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }

    const token = await createSession({ userId: user.id, email: user.email, name: user.name })
    await setSessionCookie(token)

    return Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error('[login]', err)
    return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

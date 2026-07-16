import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, phone } = (await req.json()) as {
      email: string
      password: string
      name?: string
      phone: string
    }

    if (!email || !password) {
      return Response.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }
    if (password.length < 8) {
      return Response.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }
    if (!phone) {
      return Response.json({ error: '휴대폰 인증을 완료해주세요.' }, { status: 400 })
    }

    const normalized = normalizePhone(phone)

    const smsRecord = await prisma.smsVerification.findFirst({
      where: { phone: normalized, verified: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!smsRecord) {
      return Response.json({ error: '휴대폰 인증을 완료해주세요.' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return Response.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 })
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: normalized } })
    if (existingPhone) {
      return Response.json({ error: '이미 가입된 휴대폰 번호입니다.' }, { status: 409 })
    }

    const hashed = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name ?? null, phone: normalized },
    })

    const token = await createSession({ userId: user.id, email: user.email, name: user.name })
    await setSessionCookie(token)

    return Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error('[register]', err)
    return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

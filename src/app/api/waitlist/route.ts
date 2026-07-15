import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { email } = await req.json() as { email: string }

  if (!email || !email.includes('@')) {
    return Response.json({ error: '올바른 이메일을 입력해주세요.' }, { status: 400 })
  }

  const session = await getSession()

  try {
    await prisma.waitlist.upsert({
      where: { email },
      update: { userId: session?.userId ?? null },
      create: { email, userId: session?.userId ?? null },
    })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: '이미 등록된 이메일입니다.' }, { status: 400 })
  }
}

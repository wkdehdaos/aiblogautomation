import { prisma } from '@/lib/db'
import crypto from 'crypto'

// 개발 테스트용 — 프로덕션에서는 사용 금지
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'not allowed' }, { status: 403 })
  }

  let user = await prisma.user.findFirst({
    where: { email: 'jjangda895@gmail.com' },
    select: { id: true },
  })

  if (!user) {
    const { hashSync } = await import('bcryptjs')
    user = await prisma.user.create({
      data: { email: 'jjangda895@gmail.com', password: hashSync('test1234', 10) },
      select: { id: true },
    })
  }

  const token = crypto.randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: user.id },
    data: { uploadToken: token, uploadTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  })

  return Response.json({ token })
}

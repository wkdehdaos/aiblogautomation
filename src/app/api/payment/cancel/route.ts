import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  if (user.plan === 'free') {
    return Response.json({ error: '이미 무료 플랜입니다.' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      plan: 'free',
      billingKey: null,
      billingCustomerKey: null,
      planExpiresAt: null,
    },
  })

  return Response.json({ ok: true })
}

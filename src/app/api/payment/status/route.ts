import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPostLimit, isNewMonth } from '@/lib/plans'

export async function GET() {
  const session = await getSession()
  if (!session) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  // 월 초기화 필요 여부 확인
  if (isNewMonth(user.postCountResetAt)) {
    user = await prisma.user.update({
      where: { id: session.userId },
      data: { postCount: 0, postCountResetAt: new Date() },
    })
  }

  const limit = getPostLimit(user.plan)

  return Response.json({
    plan: user.plan,
    postCount: user.postCount,
    postLimit: limit === Infinity ? null : limit,
    planExpiresAt: user.planExpiresAt,
    hasBilling: !!user.billingKey,
  })
}

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { naverSession: null },
  })

  return Response.json({ ok: true })
}

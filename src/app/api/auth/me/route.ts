import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ user: null }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, betaCount: true },
  })

  if (!user) return Response.json({ user: null }, { status: 401 })

  return Response.json({
    user: {
      userId: user.id,
      email: user.email,
      name: user.name,
      betaCount: user.betaCount,
    },
  })
}

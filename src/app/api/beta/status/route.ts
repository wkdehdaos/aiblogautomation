import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [config, userCount] = await Promise.all([
      prisma.betaConfig.findUnique({ where: { id: 1 } }),
      prisma.user.count({ where: { email: { not: process.env.ADMIN_EMAIL } } }),
    ])
    const maxUsers = config?.maxUsers ?? Number(process.env.BETA_MAX_USERS ?? 30)
    return Response.json({ userCount, maxUsers, isFull: userCount >= maxUsers })
  } catch {
    const maxUsers = Number(process.env.BETA_MAX_USERS ?? 30)
    return Response.json({ userCount: 0, maxUsers, isFull: false })
  }
}

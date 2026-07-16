import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session || session.email !== process.env.ADMIN_EMAIL) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { maxUsers } = await req.json() as { maxUsers: number }
  if (!maxUsers || maxUsers < 1 || !Number.isInteger(maxUsers)) {
    return Response.json({ error: '잘못된 값입니다.' }, { status: 400 })
  }

  const config = await prisma.betaConfig.upsert({
    where: { id: 1 },
    create: { id: 1, maxUsers },
    update: { maxUsers },
  })

  return Response.json({ ok: true, maxUsers: config.maxUsers })
}

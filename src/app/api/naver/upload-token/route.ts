import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15분

  await prisma.user.update({
    where: { id: session.userId },
    data: { uploadToken: token, uploadTokenExpiresAt: expiresAt },
  })

  return Response.json({ token, expiresAt: expiresAt.toISOString() })
}

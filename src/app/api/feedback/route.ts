import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { rating, publishSuccess, comment } = await req.json() as {
    rating: number
    publishSuccess: boolean
    comment?: string
  }

  if (!rating || rating < 1 || rating > 5) {
    return Response.json({ error: '별점을 선택해주세요.' }, { status: 400 })
  }

  await prisma.feedback.create({
    data: {
      userId: session.userId,
      rating,
      publishSuccess,
      comment: comment ?? null,
    },
  })

  return Response.json({ ok: true })
}

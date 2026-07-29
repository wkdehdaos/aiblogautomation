import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Plan, PLANS } from '@/lib/plans'

const PORTONE_API = 'https://api.portone.io'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { paymentId, plan, expectedAmount } = (await req.json()) as {
    paymentId: string
    plan: Plan
    expectedAmount: number
  }

  if (!paymentId || !plan || !PLANS[plan]) {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  if (plan === 'free') {
    return Response.json({ error: '무료 플랜으로는 결제할 수 없습니다.' }, { status: 400 })
  }

  const apiSecret = process.env.PORTONE_API_SECRET
  if (!apiSecret) {
    return Response.json({ error: '결제 서비스 설정 오류입니다.' }, { status: 500 })
  }

  // PortOne V2 결제 검증
  const verifyRes = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${apiSecret}` },
  })

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({})) as { message?: string }
    return Response.json({ error: err.message ?? '결제 검증 실패' }, { status: 400 })
  }

  const payment = (await verifyRes.json()) as {
    status: string
    totalAmount: number
    currency: string
  }

  if (payment.status !== 'PAID') {
    return Response.json({ error: `결제 상태가 올바르지 않습니다. (${payment.status})` }, { status: 400 })
  }

  const planInfo = PLANS[plan]
  if (payment.totalAmount !== (expectedAmount ?? planInfo.price)) {
    return Response.json({ error: '결제 금액이 일치하지 않습니다.' }, { status: 400 })
  }

  const planExpiresAt = new Date()
  planExpiresAt.setMonth(planExpiresAt.getMonth() + 1)

  await prisma.user.update({
    where: { id: session.userId },
    data: { plan, planExpiresAt },
  })

  return Response.json({ ok: true, plan, planExpiresAt })
}

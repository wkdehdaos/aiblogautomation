import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encrypt'
import { Plan, PLANS } from '@/lib/plans'

const TOSS_API = 'https://api.tosspayments.com/v1'

function tossAuth() {
  const secret = process.env.TOSS_SECRET_KEY ?? ''
  return 'Basic ' + Buffer.from(secret + ':').toString('base64')
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { authKey, customerKey, plan } = (await req.json()) as {
    authKey: string
    customerKey: string
    plan: Plan
  }

  if (!authKey || !customerKey || !plan || !PLANS[plan]) {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  if (plan === 'free') {
    return Response.json({ error: '무료 플랜으로는 결제할 수 없습니다.' }, { status: 400 })
  }

  // 1. 빌링키 발급
  const issueRes = await fetch(`${TOSS_API}/billing/authorizations/issue`, {
    method: 'POST',
    headers: { Authorization: tossAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey, customerKey }),
  })
  if (!issueRes.ok) {
    const err = await issueRes.json().catch(() => ({})) as { message?: string }
    return Response.json({ error: err.message ?? '빌링키 발급 실패' }, { status: 400 })
  }
  const { billingKey } = (await issueRes.json()) as { billingKey: string }

  // 2. 첫 달 즉시 결제
  const planInfo = PLANS[plan]
  const orderId = `ORDER-${session.userId}-${Date.now()}`
  const chargeRes = await fetch(`${TOSS_API}/billing/${billingKey}`, {
    method: 'POST',
    headers: { Authorization: tossAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerKey,
      amount: planInfo.price,
      orderId,
      orderName: `AI블로그 ${planInfo.label} 플랜`,
      customerEmail: session.email,
      customerName: session.name ?? session.email,
    }),
  })
  if (!chargeRes.ok) {
    const err = await chargeRes.json().catch(() => ({})) as { message?: string }
    return Response.json({ error: err.message ?? '결제 실패' }, { status: 400 })
  }

  // 3. DB 업데이트
  const planExpiresAt = new Date()
  planExpiresAt.setMonth(planExpiresAt.getMonth() + 1)

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      plan,
      billingKey: encrypt(billingKey),
      billingCustomerKey: customerKey,
      planExpiresAt,
    },
  })

  return Response.json({ ok: true, plan, planExpiresAt })
}

// 월 결제 갱신 (내부 호출용)
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.TOSS_SECRET_KEY}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = (await req.json()) as { userId: string }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.billingKey || !user.billingCustomerKey || !user.plan || user.plan === 'free') {
    return Response.json({ error: '구독 정보 없음' }, { status: 400 })
  }

  const planInfo = PLANS[user.plan as Plan]
  if (!planInfo) return Response.json({ error: '알 수 없는 플랜' }, { status: 400 })

  const billingKey = decrypt(user.billingKey)
  if (!billingKey) return Response.json({ error: '빌링키 복호화 실패' }, { status: 500 })

  const orderId = `ORDER-${userId}-${Date.now()}`
  const chargeRes = await fetch(`${TOSS_API}/billing/${billingKey}`, {
    method: 'POST',
    headers: { Authorization: tossAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerKey: user.billingCustomerKey,
      amount: planInfo.price,
      orderId,
      orderName: `AI블로그 ${planInfo.label} 플랜`,
      customerEmail: user.email,
      customerName: user.name ?? user.email,
    }),
  })

  if (!chargeRes.ok) {
    const err = await chargeRes.json().catch(() => ({})) as { message?: string }
    return Response.json({ error: err.message ?? '갱신 결제 실패' }, { status: 400 })
  }

  const planExpiresAt = new Date()
  planExpiresAt.setMonth(planExpiresAt.getMonth() + 1)
  await prisma.user.update({
    where: { id: userId },
    data: { planExpiresAt },
  })

  return Response.json({ ok: true })
}

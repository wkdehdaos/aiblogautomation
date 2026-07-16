import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = (await req.json()) as { phone: string; code: string }

    if (!phone || !code) {
      return Response.json({ error: '전화번호와 인증번호를 입력해주세요.' }, { status: 400 })
    }

    const normalized = normalizePhone(phone)

    const record = await prisma.smsVerification.findFirst({
      where: { phone: normalized, code },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) {
      return Response.json({ error: '인증번호가 올바르지 않아요.' }, { status: 400 })
    }

    if (record.expiresAt < new Date()) {
      return Response.json({ error: '인증번호가 만료됐어요.' }, { status: 400 })
    }

    await prisma.smsVerification.update({
      where: { id: record.id },
      data: { verified: true },
    })

    return Response.json({ ok: true, verified: true })
  } catch (err) {
    console.error('[verify-sms]', err)
    return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

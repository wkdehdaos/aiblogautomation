import { NextRequest } from 'next/server'
import { SolapiMessageService } from 'solapi'
import { prisma } from '@/lib/db'

const DAILY_LIMIT = 5
const EXPIRE_MINUTES = 5

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = (await req.json()) as { phone: string }

    if (!phone) {
      return Response.json({ error: '전화번호를 입력해주세요.' }, { status: 400 })
    }

    const normalized = normalizePhone(phone)
    if (!/^01[0-9]{8,9}$/.test(normalized)) {
      return Response.json({ error: '올바른 휴대폰 번호를 입력해주세요.' }, { status: 400 })
    }

    const existingUser = await prisma.user.findUnique({ where: { phone: normalized } })
    if (existingUser) {
      return Response.json({ error: '이미 가입된 휴대폰 번호입니다.' }, { status: 409 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const count = await prisma.smsVerification.count({
      where: { phone: normalized, createdAt: { gte: todayStart } },
    })
    if (count >= DAILY_LIMIT) {
      return Response.json(
        { error: '하루 인증 요청 횟수(5회)를 초과했습니다. 내일 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + EXPIRE_MINUTES * 60 * 1000)

    await prisma.smsVerification.create({ data: { phone: normalized, code, expiresAt } })

    const messageService = new SolapiMessageService(
      process.env.SOLAPI_API_KEY!,
      process.env.SOLAPI_API_SECRET!
    )
    await messageService.send({
      to: normalized,
      from: process.env.SOLAPI_SENDER!,
      text: `AI블로그 인증번호: [${code}] (5분 내 입력)`,
    })

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[send-sms]', err)
    return Response.json({ error: '인증번호 발송에 실패했습니다.', detail: String(err) }, { status: 500 })
  }
}

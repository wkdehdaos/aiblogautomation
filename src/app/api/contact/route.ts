import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const { name, email, type, content } = await req.json() as {
    name: string
    email: string
    type: string
    content: string
  }

  if (!name || !email || !type || !content) {
    return Response.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
  }

  await prisma.contact.create({ data: { name, email, type, content } })

  // 이메일 알림 발송
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_PASSWORD
  const adminEmail = process.env.ADMIN_EMAIL

  if (gmailUser && gmailPass && adminEmail) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      })
      await transporter.sendMail({
        from: gmailUser,
        to: adminEmail,
        subject: `[AI블로그] 새 문의: ${type} - ${name}`,
        text: `이름: ${name}\n이메일: ${email}\n유형: ${type}\n\n내용:\n${content}`,
      })
    } catch (e) {
      console.error('[contact] 이메일 발송 실패:', e)
    }
  }

  return Response.json({ ok: true })
}

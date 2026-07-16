import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

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

  const resendKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL

  if (resendKey && adminEmail) {
    try {
      const resend = new Resend(resendKey)
      await resend.emails.send({
        from: '블로디(Blogdy) <onboarding@resend.dev>',
        to: adminEmail,
        subject: '[블로디(Blogdy)] 새 문의가 접수됐어요',
        text: `이름: ${name}\n이메일: ${email}\n문의 유형: ${type}\n\n내용:\n${content}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="margin:0 0 16px;font-size:18px;color:#1f2937">새 문의가 접수됐어요</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#6b7280;width:100px">이름</td><td style="padding:8px 0;color:#111827;font-weight:600">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">이메일</td><td style="padding:8px 0;color:#111827">${email}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">유형</td><td style="padding:8px 0;color:#111827">${type}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
            <p style="font-size:14px;color:#374151;white-space:pre-wrap;margin:0">${content}</p>
          </div>
        `,
      })
    } catch (e) {
      console.error('[contact] 이메일 발송 실패:', e)
    }
  }

  return Response.json({ ok: true })
}

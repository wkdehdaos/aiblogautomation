import { NextRequest } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const { errorMessage, lastStep, userComment } = await req.json() as {
    errorMessage: string
    lastStep?: string
    userComment?: string
  }

  const resendKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_EMAIL

  if (resendKey && adminEmail) {
    try {
      const resend = new Resend(resendKey)
      await resend.emails.send({
        from: '블로디(Blogdy) <onboarding@resend.dev>',
        to: adminEmail,
        subject: '[블로디(Blogdy)] 🚨 발행 오류 신고',
        text: `오류 메시지: ${errorMessage}\n실패 단계: ${lastStep ?? '알 수 없음'}\n\n사용자 설명:\n${userComment ?? '없음'}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #fecaca;border-radius:12px;background:#fff5f5">
            <h2 style="margin:0 0 16px;font-size:18px;color:#dc2626">🚨 발행 오류 신고</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px 0;color:#6b7280;width:120px">오류 메시지</td><td style="padding:8px 0;color:#111827;font-weight:600">${errorMessage}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280">실패 단계</td><td style="padding:8px 0;color:#111827">${lastStep ?? '알 수 없음'}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #fecaca;margin:16px 0"/>
            <p style="font-size:13px;color:#6b7280;margin:0 0 4px">사용자 설명</p>
            <p style="font-size:14px;color:#374151;white-space:pre-wrap;margin:0">${userComment ?? '없음'}</p>
          </div>
        `,
      })
    } catch (e) {
      console.error('[feedback/error] 이메일 발송 실패:', e)
    }
  }

  return Response.json({ ok: true })
}

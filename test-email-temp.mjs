import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'jjangda895@gmail.com',
    pass: 'hdyztiejfbtghmur',
  },
})

try {
  const info = await transporter.sendMail({
    from: '"AI블로그" <jjangda895@gmail.com>',
    to: 'jjangda895@gmail.com',
    subject: '[AI블로그] 새 문의가 접수됐어요',
    text: '이름: 테스트유저\n이메일: test@test.com\n문의 유형: 제휴 문의\n\n내용:\n이메일 발송 테스트입니다.',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="margin:0 0 16px;font-size:18px;color:#1f2937">새 문의가 접수됐어요</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#6b7280;width:100px">이름</td><td style="padding:8px 0;color:#111827;font-weight:600">테스트유저</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">이메일</td><td style="padding:8px 0;color:#111827">test@test.com</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">유형</td><td style="padding:8px 0;color:#111827">제휴 문의</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="font-size:14px;color:#374151;margin:0">이메일 발송 테스트입니다.</p>
      </div>
    `,
  })
  console.log('✅ 발송 성공:', info.messageId)
} catch (e) {
  console.error('❌ 발송 실패:', e.message)
}

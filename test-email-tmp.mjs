import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'jjangda895@gmail.com',
    pass: 'xmzgyrkjzbcjujeg',
  },
})

try {
  const info = await transporter.sendMail({
    from: '"AI블로그" <jjangda895@gmail.com>',
    to: 'jjangda895@gmail.com',
    subject: '[AI블로그] 새 문의가 접수됐어요',
    text: '이름: 테스트유저\n이메일: test@test.com\n문의 유형: 제휴 문의\n\n내용:\n이메일 발송 테스트입니다.',
  })
  console.log('✅ 발송 성공:', info.messageId)
} catch (e) {
  console.error('❌ 발송 실패:', e.message)
}

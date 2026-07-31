import { prisma } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

async function main() {
  const email = 'test@blogdy.dev'
  const password = 'test1234!'
  const phone = '01000000000'

  // SMS 인증 레코드 삽입 (우회)
  await prisma.smsVerification.create({
    data: {
      phone,
      code: '000000',
      verified: true,
      expiresAt: new Date(Date.now() + 86400000),
    },
  })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log('이미 존재:', existing.email)
    return
  }

  const hashed = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, password: hashed, name: '테스트', phone },
  })
  console.log('생성 완료:', user.email, '/ 비번:', password)
}

main().catch(console.error).finally(() => prisma.$disconnect())

import { PrismaClient } from './src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import crypto from 'crypto'

// prisma CLI가 사용하는 root dev.db 경로 사용
const dbUrl = process.env.DATABASE_URL ?? 'file:C:/Users/a0106/ai-blog/dev.db'
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter } as never)

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } })
  console.log('users:', JSON.stringify(users))

  const user = users.find((u: { id: string; email: string }) => u.email === 'jjangda895@gmail.com')
  if (!user) {
    // 유저 없으면 생성
    console.log('유저 없음 → 생성')
    const { hashSync } = await import('bcryptjs')
    const newUser = await prisma.user.create({
      data: {
        email: 'jjangda895@gmail.com',
        password: hashSync('test1234', 10),
        name: '테스트'
      }
    })
    console.log('생성됨:', newUser.id)
  }

  const target = await prisma.user.findFirst({ where: { email: 'jjangda895@gmail.com' }, select: { id: true } })
  if (!target) { console.error('유저 조회 실패'); process.exit(1) }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await prisma.user.update({
    where: { id: target.id },
    data: { uploadToken: token, uploadTokenExpiresAt: expiresAt }
  })

  console.log('TOKEN:' + token)
  await prisma.$disconnect()
}

main().catch(console.error)

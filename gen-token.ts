import { PrismaClient } from './src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import crypto from 'crypto'
import path from 'path'

const dbUrl = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter } as never)

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } })
  console.log('users:', JSON.stringify(users))

  const user = users.find((u: { id: string; email: string }) => u.email === 'jjangda895@gmail.com')
  if (!user) { console.error('유저 없음'); process.exit(1) }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: { uploadToken: token, uploadTokenExpiresAt: expiresAt }
  })

  console.log('TOKEN:' + token)
  await prisma.$disconnect()
}

main().catch(console.error)

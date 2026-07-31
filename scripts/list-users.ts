import { prisma } from '../src/lib/db'

const users = await prisma.user.findMany({ select: { email: true, plan: true, betaCount: true }, take: 5 })
console.log(JSON.stringify(users, null, 2))
await prisma.$disconnect()

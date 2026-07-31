import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const users = await p.user.findMany({ select: { email: true, plan: true, betaCount: true }, take: 5 })
console.log(JSON.stringify(users, null, 2))
await p.$disconnect()

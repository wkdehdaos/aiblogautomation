import { createClient } from '@libsql/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')

const client = createClient({ url: `file:${dbPath}` })
await client.execute(`UPDATE "BetaConfig" SET "maxUsers" = 20 WHERE "id" = 1`)
console.log('BetaConfig maxUsers updated to 20.')
await client.close()

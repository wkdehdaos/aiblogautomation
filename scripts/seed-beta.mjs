import { createClient } from '@libsql/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db')

const client = createClient({ url: `file:${dbPath}` })

await client.execute(`
  CREATE TABLE IF NOT EXISTS "BetaConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "maxUsers" INTEGER NOT NULL DEFAULT 30
  )
`)
await client.execute(`INSERT OR IGNORE INTO "BetaConfig" ("id", "maxUsers") VALUES (1, 30)`)
console.log('BetaConfig table created and seeded.')
await client.close()

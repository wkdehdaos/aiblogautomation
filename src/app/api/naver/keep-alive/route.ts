import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encrypt'
import { chromium } from 'playwright'

// Railway cron 또는 GitHub Actions에서 호출 (CRON_SECRET 헤더로 인증)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    where: { naverSession: { not: null } },
    select: { id: true, naverSession: true },
  })

  const results: { userId: string; status: 'refreshed' | 'expired' | 'error'; detail?: string }[] = []

  for (const user of users) {
    let browser = null
    try {
      const sessionJson = decrypt(user.naverSession!)
      if (!sessionJson) { results.push({ userId: user.id, status: 'error', detail: '복호화 실패' }); continue }

      const storageState = JSON.parse(sessionJson)
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext({ storageState })
      const page = await context.newPage()

      await page.goto('https://blog.naver.com', { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(2000)

      const url = page.url()
      const isLoggedIn = !url.includes('nid.naver.com') && !url.includes('nidlogin')

      if (isLoggedIn) {
        // 갱신된 쿠키를 DB에 저장
        const freshState = await context.storageState()
        const encrypted = encrypt(JSON.stringify(freshState))
        await prisma.user.update({
          where: { id: user.id },
          data: { naverSession: encrypted, sessionUploadedAt: new Date() },
        })
        results.push({ userId: user.id, status: 'refreshed' })
      } else {
        results.push({ userId: user.id, status: 'expired', detail: url })
      }
    } catch (e) {
      results.push({ userId: user.id, status: 'error', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      await browser?.close().catch(() => {})
    }
  }

  console.log('[keep-alive]', JSON.stringify(results))
  return Response.json({ ok: true, results })
}

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

      // /me 는 로그인 필수 페이지 — 만료 시 nid.naver.com 으로 리다이렉트됨
      // NID_AUT(30일 쿠키) 있으면 자동 재인증 후 /me 로 복귀
      await page.goto('https://blog.naver.com/me', { waitUntil: 'domcontentloaded', timeout: 30000 })

      // 자동 재인증(NID_AUT) 리다이렉트가 완료될 때까지 대기
      await page.waitForURL(
        url => !url.includes('nid.naver.com') && !url.includes('nidlogin'),
        { timeout: 15000 }
      ).catch(() => {})

      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

      const url = page.url()
      const isLoggedIn = !url.includes('nid.naver.com') && !url.includes('nidlogin')

      if (isLoggedIn) {
        const freshState = await context.storageState()

        // NID_AUT(30일 세션) 없으면 경고 — keep-alive로 유지 불가
        const hasNidAut = freshState.cookies?.some((c: { name: string }) => c.name === 'NID_AUT')
        if (!hasNidAut) {
          results.push({ userId: user.id, status: 'expired', detail: 'NID_AUT 없음 — 재연결 필요' })
          continue
        }

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

import { NextRequest } from 'next/server'
import { chromium } from 'playwright'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'

const LOGIN_URL = 'https://nid.naver.com/nidlogin.login'
const TIMEOUT = 20_000

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  let browser
  try {
    const { naverId, naverPassword } = (await req.json()) as {
      naverId: string
      naverPassword: string
    }

    if (!naverId || !naverPassword) {
      return Response.json({ error: '네이버 ID와 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const isHeadless = process.env.NODE_ENV === 'production'
    browser = await chromium.launch({ headless: isHeadless })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    // ID 입력 (Naver는 JS 이벤트로 처리 — type으로 한 글자씩 입력)
    const idInput = page.locator('#id').first()
    await idInput.click({ timeout: TIMEOUT })
    await idInput.type(naverId, { delay: 60 })

    await page.waitForTimeout(400)

    // 비밀번호 입력
    const pwInput = page.locator('#pw').first()
    await pwInput.click({ timeout: TIMEOUT })
    await pwInput.type(naverPassword, { delay: 60 })

    await page.waitForTimeout(400)

    // 로그인 버튼 클릭
    const loginBtn = page.locator('.btn_login, input[type="submit"], button[type="submit"]').first()
    await loginBtn.click({ timeout: TIMEOUT })

    // 로그인 성공 감지: nidlogin이 아닌 URL로 이동
    try {
      await page.waitForURL(
        (url) => !url.includes('nidlogin') && !url.includes('nid.naver.com/login'),
        { timeout: 15_000 }
      )
    } catch {
      // 현재 URL 확인 후 실패 판단
      const currentUrl = page.url()
      if (currentUrl.includes('nidlogin')) {
        await browser.close()
        return Response.json(
          { error: '로그인 실패. ID/비밀번호가 올바른지 확인하거나 캡차가 필요한 경우 잠시 후 다시 시도해주세요.' },
          { status: 400 }
        )
      }
    }

    // storageState 추출 → 암호화 → DB 저장
    const storageState = await context.storageState()
    await browser.close()
    browser = undefined

    const encrypted = encrypt(JSON.stringify(storageState))
    await prisma.user.update({
      where: { id: session.userId },
      data: { naverSession: encrypted },
    })

    return Response.json({ ok: true })
  } catch (err) {
    if (browser) await browser.close().catch(() => {})
    console.error('[naver/start-login]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

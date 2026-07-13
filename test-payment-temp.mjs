import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'
const SCRATCHPAD = 'C:/Users/a0106/AppData/Local/Temp/claude/C--Users-a0106-ai-blog/b2064c95-3d63-4a25-9775-899d71c8e3f4/scratchpad'

const browser = await chromium.launch({ headless: false, slowMo: 500 })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

page.on('console', msg => console.log(`[browser ${msg.type()}]`, msg.text()))
page.on('pageerror', err => console.error('[page error]', err.message))

const ss = (name) => page.screenshot({
  path: `${SCRATCHPAD}/${name}.png`,
  fullPage: true
})

try {
  // 1. 로그인
  console.log('1. 로그인 페이지')
  await page.goto(`${BASE}/login`)
  await ss('01-login')

  await page.fill('input[type="email"], input[name="email"]', 'test@test.com')
  await page.fill('input[type="password"], input[name="password"]', 'test1234')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  await ss('02-after-login')
  console.log('현재 URL:', page.url())

  // 2. 프라이싱 페이지
  console.log('2. /pricing 접속')
  await page.goto(`${BASE}/pricing`)
  await page.waitForTimeout(2000)
  await ss('03-pricing')

  const allButtons = await page.locator('button').allTextContents()
  console.log('버튼 목록:', allButtons)

  // 3. 베이직 업그레이드 버튼 클릭
  const upgradeBtn = page.locator('button', { hasText: '베이직으로 업그레이드' })
  const btnCount = await upgradeBtn.count()
  console.log('업그레이드 버튼 수:', btnCount)

  if (btnCount > 0) {
    await upgradeBtn.first().click()
    await page.waitForTimeout(5000)
    await ss('04-toss-window')
    console.log('클릭 후 URL:', page.url())

    const frames = page.frames()
    console.log('프레임 수:', frames.length)
    for (const f of frames) {
      console.log('  frame url:', f.url())
    }
  } else {
    console.log('❌ 업그레이드 버튼 없음')
  }

} catch (e) {
  console.error('오류:', e.message)
  await ss('error').catch(() => {})
} finally {
  await page.waitForTimeout(3000)
  await browser.close()
}

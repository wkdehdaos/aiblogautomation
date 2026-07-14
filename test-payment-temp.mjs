import { chromium } from 'playwright'

const BASE = 'https://aiblogautomation-production.up.railway.app'
const SCRATCHPAD = 'C:/Users/a0106/AppData/Local/Temp/claude/C--Users-a0106-ai-blog/b2064c95-3d63-4a25-9775-899d71c8e3f4/scratchpad'

const browser = await chromium.launch({ headless: false, slowMo: 500 })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

page.on('console', msg => {
  if (msg.type() === 'error') console.log(`[browser error]`, msg.text())
})
page.on('pageerror', err => console.error('[page error]', err.message))

const ss = (name) => page.screenshot({
  path: `${SCRATCHPAD}/${name}.png`,
  fullPage: true
})

try {
  // 1. 홈 접속 확인
  console.log('1. 프로덕션 홈 접속')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await ss('prod-01-home')
  console.log('URL:', page.url())

  // 2. 로그인
  console.log('2. 로그인 페이지')
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await ss('prod-02-login')

  await page.fill('input[type="email"]', 'a01067709308@gmail.com')
  await page.fill('input[type="password"]', 'sosjbw4239@@')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  await ss('prod-03-after-login')
  console.log('로그인 후 URL:', page.url())

  // 3. 프라이싱
  console.log('3. /pricing 접속')
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await ss('prod-04-pricing')

  const allButtons = await page.locator('button').allTextContents()
  console.log('버튼 목록:', allButtons)

  // 4. 베이직 업그레이드 클릭
  const upgradeBtn = page.locator('button', { hasText: '베이직으로 업그레이드' })
  const btnCount = await upgradeBtn.count()
  console.log('업그레이드 버튼:', btnCount)

  // loadTossPayments 호출 시 실제 키 값 캡처
  await page.addInitScript(() => {
    window.__tossKey = null
    const origFetch = window.fetch
    window.fetch = function(...args) {
      const url = args[0]
      if (typeof url === 'string' && url.includes('tosspayments')) {
        console.log('TOSS_FETCH:', url)
      }
      return origFetch.apply(this, args)
    }
  })

  // Toss SDK 로드 인터셉트
  await page.route('**/*tosspayments*', async route => {
    console.log('TOSS_REQUEST:', route.request().url())
    await route.continue()
  })

  if (btnCount > 0) {
    await upgradeBtn.first().click()
    await page.waitForTimeout(5000)
    await ss('prod-05-toss')
    console.log('클릭 후 URL:', page.url())

    const frames = page.frames()
    console.log('프레임 수:', frames.length)
    for (const f of frames) console.log('  frame:', f.url())
  } else {
    console.log('❌ 업그레이드 버튼 없음')
  }

} catch (e) {
  console.error('오류:', e.message)
  await ss('prod-error').catch(() => {})
} finally {
  await page.waitForTimeout(3000)
  await browser.close()
}

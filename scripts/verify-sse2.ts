import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SHOT_DIR = 'C:/Users/a0106/AppData/Local/Temp/claude/C--Users-a0106-ai-blog/c8ba1205-07b1-4744-87ce-5bd6a4aba174/scratchpad/shots2'
fs.mkdirSync(SHOT_DIR, { recursive: true })
let shotIdx = 0
const snap = async (page: import('playwright').Page, name: string) => {
  await page.screenshot({ path: path.join(SHOT_DIR, `${String(++shotIdx).padStart(2,'0')}-${name}.png`), fullPage: false })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(60000)

  try {
    // Login
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'test@blogdy.dev')
    await page.fill('input[type="password"]', 'test1234!')
    await page.click('button[type="submit"]')
    await page.waitForURL('http://localhost:3000/')
    console.log('✅ 로그인')

    // Fill test data
    await page.click('button:has-text("테스트 자동입력")')
    await page.waitForTimeout(800)

    // Intercept the SSE response to verify content-type
    const [, genRes] = await Promise.all([
      page.locator('button[type="submit"]').last().click(),
      page.waitForResponse(r => r.url().includes('/api/generate'))
    ])
    console.log(`[gen] Content-Type: ${genRes.headers()['content-type']}`)
    console.log(`[gen] Status: ${genRes.status()}`)

    // 1. Streaming label appears quickly
    await page.waitForSelector('p:has-text("AI가 글을 작성하고 있어요")', { timeout: 15000 })
    await snap(page, '01-streaming-label')
    console.log('✅ "AI가 글을 작성하고 있어요..." 표시됨')

    // 2. Wait for streaming to FINISH: indicator disappears, result title appears
    // The streaming label is gone when result is set
    await page.waitForSelector('p:has-text("AI가 글을 작성하고 있어요")', { state: 'hidden', timeout: 90000 })
    await snap(page, '02-streaming-done')
    console.log('✅ 스트리밍 완료 (로딩 인디케이터 사라짐)')

    // 3. Verify result title visible
    const titleEl = page.locator('.slide-in-right h2').first()
    await titleEl.waitFor({ state: 'visible', timeout: 5000 })
    const titleText = await titleEl.textContent()
    console.log(`✅ 제목: "${titleText?.trim().slice(0, 80)}"`)

    // 4. Verify action buttons
    await page.waitForSelector('button:has-text("올리기")', { timeout: 5000 })
    await page.waitForSelector('button:has-text("수정하기")', { timeout: 5000 })
    console.log('✅ 올리기 + 수정하기 버튼 표시됨')
    await snap(page, '03-result-with-buttons')

    // 5. Verify button text was "✍️ 글 작성 중..." (already gone now, but captured in shot 01)
    console.log('🔍 [probe] 왼쪽 생성 버튼 텍스트 현재 상태:',
      await page.locator('button[type="submit"]').last().textContent()
    )

    // 6. Scroll right panel to see full content
    await page.evaluate(() => {
      document.querySelector('.slide-in-right')?.scrollTo(0, 9999)
    })
    await page.waitForTimeout(300)
    await snap(page, '04-content-bottom')

    // 7. Check font selector visible
    const fontSel = await page.locator('select').filter({ hasText: '나눔고딕' }).isVisible()
    console.log(`✅ 서체 선택 표시됨: ${fontSel}`)

    console.log('\n=== PASS ===')
  } finally {
    await browser.close()
    console.log('스크린샷:', SHOT_DIR)
  }
}

main().catch(e => { console.error('❌', e); process.exit(1) })

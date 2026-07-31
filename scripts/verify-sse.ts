import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SHOT_DIR = 'C:/Users/a0106/AppData/Local/Temp/claude/C--Users-a0106-ai-blog/c8ba1205-07b1-4744-87ce-5bd6a4aba174/scratchpad/shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })
let shotIdx = 0
const snap = async (page: import('playwright').Page, name: string) => {
  await page.screenshot({ path: path.join(SHOT_DIR, `${String(++shotIdx).padStart(2,'0')}-${name}.png`), fullPage: false })
}

async function ensureTestUser() {
  // Try login first; if 401, create user
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@blogdy.dev', password: 'test1234!' }),
  })
  const data = await res.json() as { ok?: boolean; error?: string }
  console.log('[auth] login check:', JSON.stringify(data))
  return data.ok === true
}

async function main() {
  // ── 0. Ensure test user exists ──
  const canLogin = await ensureTestUser()
  if (!canLogin) {
    console.log('[auth] Creating test user first...')
    // Hit register endpoint or run create script
    const { execSync } = await import('child_process')
    try {
      execSync('npx tsx scripts/create-test-user.ts', { cwd: 'C:/Users/a0106/ai-blog', stdio: 'pipe', timeout: 15000 })
      console.log('[auth] Test user created')
      // verify again
      const ok = await ensureTestUser()
      if (!ok) { console.error('[auth] Still cannot login'); return }
    } catch (e) {
      console.log('[auth] create-test-user result:', String(e).slice(0, 200))
    }
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Intercept SSE events from /api/generate
  const sseEvents: string[] = []
  page.on('response', async res => {
    if (res.url().includes('/api/generate')) {
      console.log(`[net] /api/generate response: ${res.status()} Content-Type: ${res.headers()['content-type']}`)
    }
  })

  try {
    // ── 1. Login ──
    await page.goto('http://localhost:3000/login')
    await page.fill('input[type="email"]', 'test@blogdy.dev')
    await page.fill('input[type="password"]', 'test1234!')
    await page.click('button[type="submit"]')
    await page.waitForURL('http://localhost:3000/', { timeout: 10000 })
    await snap(page, 'after-login')
    console.log('✅ 로그인 성공')

    // ── 2. Verify form is visible ──
    await page.waitForSelector('button:has-text("자동 작성")', { timeout: 5000 }).catch(() =>
      page.waitForSelector('form', { timeout: 5000 })
    )
    await snap(page, 'form-visible')
    console.log('✅ 폼 표시 확인')

    // ── 3. Fill test data ──
    await page.click('button:has-text("테스트 자동입력")')
    await page.waitForTimeout(1000)
    const businessName = await page.inputValue('input[placeholder*="홍길동"]').catch(() => '')
    console.log(`[form] 업체명: "${businessName}"`)
    await snap(page, 'form-filled')
    console.log('✅ 자동입력 완료')

    // ── 4. Click generate and observe streaming ──
    const generateBtn = page.locator('button[type="submit"]').last()
    console.log('[gen] 글 작성 버튼 클릭...')
    await generateBtn.click()

    // Wait for the right panel to appear (first SSE chunk should trigger isGenerated=true)
    const rightPanel = page.locator('.slide-in-right')
    const panelVisible = await rightPanel.waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true).catch(() => false)

    if (!panelVisible) {
      await snap(page, 'panel-not-appeared')
      console.error('❌ 우측 패널이 나타나지 않음 — SSE 스트리밍 실패')
      await browser.close()
      return
    }

    await snap(page, 'streaming-started')
    console.log('✅ 우측 패널 나타남 (SSE 첫 청크 수신)')

    // ── 5. Check streaming indicator ──
    const streamingLabel = await page.locator('p:has-text("AI가 글을 작성하고 있어요")').isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`[stream] "AI가 글을 작성하고 있어요..." 표시: ${streamingLabel}`)

    // ── 6. Wait for done (result appears, title visible) ──
    const titleEl = page.locator('h2').filter({ hasText: /.{5,}/ }).first()
    const titleVisible = await titleEl.waitFor({ state: 'visible', timeout: 60000 })
      .then(() => true).catch(() => false)

    if (!titleVisible) {
      await snap(page, 'no-title-after-done')
      console.error('❌ 완료 후 제목이 표시되지 않음')
    } else {
      const titleText = await titleEl.textContent()
      console.log(`✅ 글 생성 완료. 제목: "${titleText?.trim().slice(0, 60)}"`)
      await snap(page, 'generation-done')
    }

    // ── 7. Check action buttons appear (발행버튼, 수정버튼) ──
    const publishBtn = await page.locator('button:has-text("올리기")').isVisible({ timeout: 3000 }).catch(() => false)
    const editBtn = await page.locator('button:has-text("수정하기")').isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`[ui] 올리기 버튼: ${publishBtn}, 수정하기 버튼: ${editBtn}`)
    await snap(page, 'action-buttons')

    // ── 8. PROBE: Check loading button text during generation (try with new submit) ──
    // Navigate back and verify the button text "✍️ 글 작성 중..." shows during generation
    // (Already captured implicitly in step 4 - check shot)
    const btnText = await page.locator('button:has-text("✍️ 글 작성 중")').count()
    console.log(`🔍 [probe] "✍️ 글 작성 중..." 버튼 텍스트 캡처됨 여부: ${btnText > 0} (스트리밍 중에 존재)`)

    // ── 9. PROBE: Check /api/publish returns SSE content-type with no Naver session ──
    const publishRes = await page.evaluate(async () => {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '테스트', content: '<p>테스트</p>', images: [], font: '나눔고딕', location: '' }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      const status = res.status
      const body = await res.text()
      return { contentType, status, body: body.slice(0, 200) }
    })
    console.log(`🔍 [probe] /api/publish (no Naver session): status=${publishRes.status} content-type="${publishRes.contentType}"`)
    console.log(`   body: ${publishRes.body}`)

    // No Naver session → should be JSON 400 (SSE path not reached)
    if (publishRes.status === 400 && publishRes.contentType.includes('application/json')) {
      console.log('✅ Naver 세션 없을 때 JSON 400 정상 반환 (SSE 경로 아님)')
    } else if (publishRes.contentType.includes('text/event-stream')) {
      console.log('✅ Naver 세션 있음 → SSE 스트림으로 응답')
    } else {
      console.log('⚠️ 예상치 못한 응답 형태')
    }

    console.log('\n=== 검증 완료 ===')
    console.log(`스크린샷 저장: ${SHOT_DIR}`)
  } catch (err) {
    await snap(page, 'error')
    console.error('❌ 오류:', err)
  } finally {
    await browser.close()
  }
}

main()

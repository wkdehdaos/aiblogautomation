import { chromium, Page, FrameLocator } from 'playwright'
import path from 'path'
import fs from 'fs'

// .env.local / .en.local 로드 (tsx는 자동 로드 안 함)
function loadEnvLocal() {
  for (const filename of ['.env.local', '.en.local']) {
    const envPath = path.resolve(process.cwd(), filename)
    if (!fs.existsSync(envPath)) continue
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val
    }
  }
}
loadEnvLocal()

// ──────────────────────────────────────────────
// 테스트용 하드코딩 값 (나중에 인자로 교체)
// ──────────────────────────────────────────────
const TITLE = '테스트 포스트 제목'
const CONTENT = '안녕하세요. 자동 발행 테스트 포스트입니다.\n\n두 번째 문단입니다.'
const IMAGE_PATHS: string[] = [
  // path.resolve(process.cwd(), 'public/sample.jpg'),
]
// ──────────────────────────────────────────────

const BLOG_ID = process.env.NAVER_BLOG_ID
const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'debug-screenshots')

let stepIndex = 0

async function snap(page: Page, label: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  stepIndex++
  const filename = `${String(stepIndex).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true })
  console.log(`  스크린샷: ${filename}`)
}

async function runStep(page: Page, label: string, fn: () => Promise<void>) {
  console.log(`\n[${label}]`)
  try {
    await fn()
    await snap(page, label)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await snap(page, `${label}-실패`).catch(() => {})
    console.error(`  실패: ${msg}`)
    process.exit(1)
  }
}

// SmartEditor ONE은 Shadow DOM을 쓸 수 있어 getByRole('textbox')로 탐색
// FrameLocator와 Page 둘 다 getByRole을 지원함
type LocatorCtx = Page | FrameLocator

async function findEditorCtx(page: Page): Promise<LocatorCtx> {
  // 1) 메인 페이지
  if (await page.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('  에디터: 메인 페이지')
    return page
  }

  // 2) PostWriteForm iframe (URL 확인 후 frameLocator)
  const hasPf = page.frames().some(f => f.url().includes('PostWriteForm'))
  if (hasPf) {
    const fl = page.frameLocator('iframe[src*="PostWriteForm"], iframe').first()
    if (await fl.getByRole('textbox').first().isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('  에디터: PostWriteForm frameLocator')
      return fl
    }
  }

  // 3) 모든 iframe 중 textbox가 있는 첫 번째
  const fl = page.frameLocator('iframe').first()
  if (await fl.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('  에디터: 첫 번째 iframe')
    return fl
  }

  throw new Error('에디터를 찾지 못했습니다.')
}

async function main() {
  if (!BLOG_ID) {
    console.error('NAVER_BLOG_ID 환경변수가 설정되지 않았습니다.')
    process.exit(1)
  }
  if (!fs.existsSync(SESSION_PATH)) {
    console.error(`세션 파일 없음: ${SESSION_PATH}\nnpm run naver-login 으로 먼저 로그인하세요.`)
    process.exit(1)
  }

  console.log('브라우저 실행 중...')
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ storageState: SESSION_PATH })
  const page = await context.newPage()
  let editorPage = page

  // ── 1단계: 블로그 홈 이동 ──────────────────────
  await runStep(page, '블로그홈이동', async () => {
    await page.goto(`https://blog.naver.com/${BLOG_ID}`, { waitUntil: 'domcontentloaded' })
    console.log(`  URL: ${page.url()}`)
  })

  // ── 2단계: 글쓰기 클릭 ────────────────────────
  await runStep(page, '글쓰기클릭', async () => {
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 6000 }).catch(() => null),
      page.click('a[href*="PostWriteForm"], a:has-text("글쓰기"), button:has-text("글쓰기")', { timeout: 10000 }),
    ])
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded')
      editorPage = newPage
    } else {
      await page.waitForURL(/PostWriteForm|Redirect=Write/, { timeout: 10000 })
    }
    console.log(`  에디터 URL: ${editorPage.url()}`)
  })

  // ── 3단계: 에디터 로드 대기 ────────────────────
  let editorCtx: LocatorCtx = editorPage
  await runStep(editorPage, '에디터로드대기', async () => {
    await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await editorPage.waitForTimeout(3000)

    // ① 임시저장 draft 모달 처리 ("작성 중인 글이 있습니다" → 취소 = 새 글 작성)
    const draftModal = editorCtx.locator('text=작성 중인 글이 있습니다').first()
    if (await draftModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  임시저장 draft 모달 감지 → Escape로 닫기 (새 글 작성)')
      await editorPage.keyboard.press('Escape')
      await editorPage.waitForTimeout(800)
      // Escape가 안 될 경우: 모달 첫 번째 버튼(취소) 좌표 클릭 (x≈580, y≈434)
      if (await draftModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await editorPage.mouse.click(580, 434)
        await editorPage.waitForTimeout(600)
      }
    }

    // ② 도움말 패널 닫기 + floating 패널 숨기기
    const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
    if (pfFrame) {
      // 도움말 X 버튼 (스크린샷 기준 우상단 ~1224, 42)
      await editorPage.mouse.click(1224, 42).catch(() => {})
      await editorPage.waitForTimeout(400)
      // JS로 floating 패널 숨기기
      await pfFrame.evaluate(() => {
        document.querySelectorAll<HTMLElement>(
          '.se-floating-material-menu, .se-floating-search, [class*="help"], [class*="layer_help"]'
        ).forEach(el => { el.style.display = 'none' })
      })
      await editorPage.waitForTimeout(300)
    }

    // 진단: 입력 요소 목록
    for (const frame of editorPage.frames()) {
      try {
        const info = await frame.evaluate(() =>
          Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea')).map(el => ({
            tag: el.tagName,
            cls: el.className?.toString().slice(0, 60) || undefined,
            role: el.getAttribute('role') || undefined,
            ariaHidden: el.getAttribute('aria-hidden') || undefined,
            allow: el.getAttribute('allow') || undefined,
          }))
        )
        if (info.length > 0) {
          console.log(`  [frame] ${frame.url().slice(0, 80)}`)
          info.forEach((e, i) => console.log(`    [${i}] ${JSON.stringify(e)}`))
        }
      } catch {}
    }

    editorCtx = await findEditorCtx(editorPage)
  })

  // ── 4단계: 제목 입력 ──────────────────────────
  await runStep(editorPage, '제목입력', async () => {
    const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
    if (!pfFrame) throw new Error('PostWriteForm 프레임을 찾지 못했습니다.')

    // floating 패널 숨기기
    await pfFrame.evaluate(() => {
      document.querySelectorAll<HTMLElement>('.se-floating-material-menu, .se-floating-search').forEach(
        el => { el.style.display = 'none' }
      )
    })

    // draft 모달 재확인 (step 3에서 타이밍 문제로 놓쳤을 경우)
    const draftModal2 = editorCtx.locator('text=작성 중인 글이 있습니다').first()
    if (await draftModal2.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  [step4] draft 모달 감지 → Escape로 닫기')
      await editorPage.keyboard.press('Escape')
      await editorPage.waitForTimeout(800)
      if (await draftModal2.isVisible({ timeout: 1000 }).catch(() => false)) {
        await editorPage.mouse.click(580, 434)
        await editorPage.waitForTimeout(600)
      }
    }

    // getByRole('textbox') — Shadow DOM 관통, 첫 번째가 제목 영역
    const textboxCount = await editorCtx.getByRole('textbox').count().catch(() => 0)
    console.log('  textbox count:', textboxCount)

    // 방법 1: getByRole('textbox').first() — 제목 영역
    const titleTextbox = editorCtx.getByRole('textbox').first()
    if (await titleTextbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  getByRole(textbox) 제목 발견 → 클릭 후 입력')
      await titleTextbox.click()
      await editorPage.waitForTimeout(200)
      await editorPage.keyboard.type(TITLE)
      console.log('  제목 입력 완료 (getByRole textbox)')
      return
    }

    // 방법 2: data-placeholder="제목" 속성으로 찾기
    const titleLocator = editorCtx.locator('[data-placeholder="제목"], [data-placeholder*="제목"]').first()
    if (await titleLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  data-placeholder 제목 요소 발견 → 클릭 후 입력')
      await titleLocator.click()
      await editorPage.waitForTimeout(200)
      await editorPage.keyboard.type(TITLE)
      console.log('  제목 입력 완료 (data-placeholder)')
      return
    }

    // 방법 3: 좌표 클릭 fallback (y≈245 = "제목" placeholder 중심)
    const iframeBox = await editorPage.locator('iframe').first().boundingBox()
    if (!iframeBox) throw new Error('iframe 위치를 찾지 못했습니다.')
    const titleX = iframeBox.x + 315
    const titleY = iframeBox.y + 245
    console.log('  좌표 클릭: (' + titleX + ', ' + titleY + ')')
    await editorPage.mouse.click(titleX, titleY)
    await editorPage.waitForTimeout(200)
    await editorPage.keyboard.type(TITLE)
    console.log('  제목 입력 완료 (좌표)')
  })

  // ── 5단계: 본문 입력 ──────────────────────────
  await runStep(editorPage, '본문입력', async () => {
    const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
    if (!pfFrame) throw new Error('PostWriteForm 프레임을 찾지 못했습니다.')

    // Tab으로 제목 → 본문 이동
    await editorPage.keyboard.press('Tab')
    await editorPage.waitForTimeout(300)

    // 혹은 본문 영역 클릭 (class 기반)
    const focused = await pfFrame.evaluate(() => {
      const bodyEl = document.querySelector<HTMLElement>(
        '.se-main-container .se-component, .se-section-text, [class*="editor-body"], .ProseMirror'
      )
      if (bodyEl) { bodyEl.click(); bodyEl.focus(); return true }
      return false
    })
    if (!focused) {
      console.log('  본문 영역을 JS로 못 찾아 Tab 키로 진행')
    }
    await editorPage.waitForTimeout(300)
    await editorPage.keyboard.type(CONTENT)
    console.log('  본문 입력 완료')
  })

  // ── 6단계: 이미지 업로드 (선택) ───────────────
  if (IMAGE_PATHS.length > 0) {
    await runStep(editorPage, '이미지업로드', async () => {
      const imageBtn = editorPage.locator(
        'button[aria-label*="사진"], button[title*="사진"], .se-toolbar-item-IMAGE'
      ).first()
      if (!await imageBtn.isVisible({ timeout: 5000 })) throw new Error('이미지 버튼을 찾지 못했습니다.')
      const [fileChooser] = await Promise.all([
        editorPage.waitForEvent('filechooser', { timeout: 5000 }),
        imageBtn.click(),
      ])
      await fileChooser.setFiles(IMAGE_PATHS)
      await editorPage.waitForTimeout(3000)
      console.log(`  이미지 ${IMAGE_PATHS.length}개 첨부 완료`)
    })
  } else {
    console.log('\n[이미지 업로드] IMAGE_PATHS 비어있어 건너뜁니다.')
  }

  // ── 7단계: 발행 버튼 클릭 ─────────────────────
  await runStep(editorPage, '발행버튼클릭', async () => {
    // 진단: PostWriteForm 안 버튼 목록 출력
    const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
    if (pfFrame) {
      const btns = await pfFrame.evaluate(() =>
        Array.from(document.querySelectorAll('button, a[role="button"]')).map(el => ({
          text: el.textContent?.trim().slice(0, 30),
          cls: el.className?.toString().slice(0, 60),
          aria: el.getAttribute('aria-label'),
        })).filter(b => b.text || b.aria)
      )
      console.log('  PostWriteForm 버튼 목록:')
      btns.forEach(b => console.log(`    ${JSON.stringify(b)}`))
    }

    // publish_btn 클래스 패턴으로 정확히 찾기 (예약 발행 버튼과 구분)
    const publishBtn = editorCtx.locator('button[class*="publish_btn"]').first()
    if (!await publishBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // fallback: 텍스트가 정확히 "발행"인 버튼
      const exact = editorCtx.locator('button').filter({ hasText: /^발행$/ }).first()
      if (!await exact.isVisible({ timeout: 3000 }).catch(() => false)) {
        throw new Error('발행 버튼을 찾지 못했습니다. 스크린샷을 확인해 주세요.')
      }
      await exact.click()
    } else {
      await publishBtn.click()
    }
    console.log('  발행 버튼 클릭')
  })

  // ── 8단계: 공개 설정 팝업 ─────────────────────
  await runStep(editorPage, '공개설정팝업', async () => {
    // 팝업은 PostWriteForm iframe 내부에 뜸 — "공개 설정" 텍스트로 감지
    const popup = editorCtx.locator('text=공개 설정').first()
    if (!await popup.isVisible({ timeout: 10000 }).catch(() => false)) {
      throw new Error('공개 설정 팝업이 나타나지 않았습니다.')
    }
    console.log('  공개 설정 팝업 감지됨')

    // 전체공개 라디오 — 이미 선택되어 있을 수 있어 체크 후 클릭
    const publicRadio = editorCtx.locator('label:has-text("전체공개"), input[type="radio"][value*="PUBLIC"]').first()
    if (await publicRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
      await publicRadio.click().catch(() => {})
      console.log('  전체공개 선택 (또는 이미 선택됨)')
    }
  })

  // ── 9단계: 최종 발행 확인 ─────────────────────
  await runStep(editorPage, '최종발행확인', async () => {
    const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))

    // 진단: 발행 관련 버튼 목록 출력
    if (pfFrame) {
      const popupBtns = await pfFrame.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(el => ({
          text: el.textContent?.trim().slice(0, 40),
          cls: el.className?.toString().slice(0, 80),
          visible: (el as HTMLElement).offsetParent !== null,
        })).filter(b => b.text?.includes('발행') || b.cls?.includes('publish') || b.cls?.includes('confirm'))
      )
      console.log('  [진단] 발행 관련 버튼:')
      popupBtns.forEach(b => console.log(`    ${JSON.stringify(b)}`))
    }

    // 팝업 내 "발행" 버튼 — 확인된 클래스: confirm_btn__WEaBq
    const confirmBtn = editorCtx.locator('button[class*="confirm_btn"]').first()
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click()
    } else {
      // fallback: 좌표 클릭 (스크린샷 07 기준 x≈1172, y≈554)
      console.log('  fallback: 좌표로 발행 확인 클릭')
      await editorPage.mouse.click(1172, 554)
    }
    console.log('  최종 발행 확인 클릭')
    await editorPage.waitForNavigation({ timeout: 15000 }).catch(() => {})
    console.log(`  발행 후 URL: ${editorPage.url()}`)
  })

  await snap(editorPage, '발행완료')
  console.log('\n발행이 완료되었습니다.')
  console.log(`스크린샷 폴더: ${SCREENSHOT_DIR}`)
  await browser.close()
}

main().catch((err) => {
  console.error('예기치 못한 오류:', err)
  process.exit(1)
})

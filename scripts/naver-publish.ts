import { chromium, Page, Frame } from 'playwright'
import path from 'path'
import fs from 'fs'

// .env.local / .en.local 파일을 수동으로 로드 (tsx는 자동 로드 안 함)
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

// 에디터 textbox를 찾아 반환 — getByRole은 Shadow DOM을 피어스함
// Frame 타입에는 getByRole이 없으므로 Page | Frame 대신 항상 Page 기반으로 작동하되
// PostWriteForm frame을 frameLocator로 래핑해 반환
async function findEditorLocatorContext(page: Page): Promise<Page | ReturnType<Page['frameLocator']>> {
  // 1) 메인 페이지에서 textbox 탐색
  const inMain = await page.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false)
  if (inMain) {
    console.log('  에디터: 메인 페이지')
    return page
  }

  // 2) PostWriteForm을 frameLocator로 접근 (Shadow DOM 포함)
  const pfUrl = page.frames().find(f => f.url().includes('PostWriteForm'))?.url()
  if (pfUrl) {
    // src 속성이 없는 srcdoc iframe일 수 있으므로 URL 기반으로 찾기
    const fl = page.frameLocator('iframe[src*="PostWriteForm"], iframe')
    try {
      await fl.first().getByRole('textbox').first().waitFor({ timeout: 15000 })
      console.log('  에디터: frameLocator (PostWriteForm)')
      return fl.first()
    } catch {}
  }

  // 3) 모든 iframe 중 첫 번째 frameLocator 시도
  const anyFl = page.frameLocator('iframe')
  try {
    await anyFl.first().getByRole('textbox').first().waitFor({ timeout: 5000 })
    console.log('  에디터: frameLocator (첫 번째 iframe)')
    return anyFl.first()
  } catch {}

  throw new Error('에디터 textbox를 찾지 못했습니다. 도움말 팝업을 닫았는지 확인하세요.')
}

async function main() {
  if (!BLOG_ID) {
    console.error('NAVER_BLOG_ID 환경변수가 설정되지 않았습니다. .env.local 또는 .en.local에 추가해 주세요.')
    process.exit(1)
  }
  if (!fs.existsSync(SESSION_PATH)) {
    console.error(`세션 파일이 없습니다: ${SESSION_PATH}\nnpm run naver-login 으로 먼저 로그인해 주세요.`)
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

  // ── 3단계: 에디터 로드 대기 + 프레임 탐지 ──────
  let editorCtx: Page | Frame = editorPage
  await runStep(editorPage, '에디터로드대기', async () => {
    await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await editorPage.waitForTimeout(6000) // SmartEditor ONE JS 초기화 여유

    // 진단: 전체 프레임의 입력 요소 목록 출력
    for (const frame of editorPage.frames()) {
      try {
        const info = await frame.evaluate(() => {
          const toInfo = (el: Element) => ({
            tag: el.tagName,
            id: (el as HTMLElement).id || undefined,
            cls: el.className?.toString().slice(0, 80) || undefined,
            role: el.getAttribute('role') || undefined,
            ariaHidden: el.getAttribute('aria-hidden') || undefined,
            allow: el.getAttribute('allow') || undefined,
            type: el.getAttribute('type') || undefined,
          })
          return [
            ...Array.from(document.querySelectorAll('[contenteditable]')).map(toInfo),
            ...Array.from(document.querySelectorAll('[role="textbox"]')).map(toInfo),
            ...Array.from(document.querySelectorAll('textarea:not([aria-hidden])')).map(toInfo),
          ]
        })
        if (info.length > 0) {
          console.log(`  [frame] ${frame.url().slice(0, 90)}`)
          info.forEach((e, i) => console.log(`    [${i}] ${JSON.stringify(e)}`))
        }
      } catch {}
    }

    editorCtx = await findEditorFrame(editorPage)
  })

  // ── 4단계: 제목 입력 ──────────────────────────
  await runStep(editorPage, '제목입력', async () => {
    const candidates = [
      `${EDITABLE}[aria-label*="제목"]`,
      `${EDITABLE}[class*="title"]`,
      `.se-title-input ${EDITABLE}`,
    ]
    let done = false
    for (const sel of candidates) {
      const el = editorCtx.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.scrollIntoViewIfNeeded()
        await el.click()
        await el.pressSequentially(TITLE)
        console.log(`  제목 입력 완료 (${sel})`)
        done = true
        break
      }
    }
    if (!done) {
      // 마지막 수단: aria-hidden 제외 첫 번째 contenteditable
      const first = editorCtx.locator(EDITABLE).first()
      if (!await first.isVisible({ timeout: 3000 })) throw new Error('제목 입력란을 찾지 못했습니다.')
      await first.scrollIntoViewIfNeeded()
      await first.click()
      await first.pressSequentially(TITLE)
      console.log('  제목 입력 완료 (첫 번째 editable)')
    }
  })

  // ── 5단계: 본문 입력 ──────────────────────────
  await runStep(editorPage, '본문입력', async () => {
    const allEditable = editorCtx.locator(EDITABLE)
    const count = await allEditable.count()
    console.log(`  editable 요소 개수: ${count}`)

    // 제목(index 0) 다음이 본문
    const body = count >= 2 ? allEditable.nth(1) : allEditable.first()
    if (!await body.isVisible({ timeout: 3000 })) throw new Error('본문 에디터를 찾지 못했습니다.')
    await body.scrollIntoViewIfNeeded()
    await body.click()
    await body.pressSequentially(CONTENT)
    console.log('  본문 입력 완료')
  })

  // ── 6단계: 이미지 업로드 (선택) ───────────────
  if (IMAGE_PATHS.length > 0) {
    await runStep(editorPage, '이미지업로드', async () => {
      const imageBtn = editorPage.locator(
        'button[aria-label*="사진"], button[title*="사진"], .se-toolbar-item-IMAGE, button[class*="image"]'
      ).first()
      if (!await imageBtn.isVisible({ timeout: 5000 })) throw new Error('이미지 업로드 버튼을 찾지 못했습니다.')

      const [fileChooser] = await Promise.all([
        editorPage.waitForEvent('filechooser', { timeout: 5000 }),
        imageBtn.click(),
      ])
      await fileChooser.setFiles(IMAGE_PATHS)
      console.log(`  이미지 ${IMAGE_PATHS.length}개 첨부 완료`)
      await editorPage.waitForTimeout(3000)
    })
  } else {
    console.log('\n[이미지 업로드] IMAGE_PATHS 비어있어 건너뜁니다.')
  }

  // ── 7단계: 발행 버튼 클릭 ─────────────────────
  await runStep(editorPage, '발행버튼클릭', async () => {
    const publishBtn = editorPage.locator(
      'button:has-text("발행"), button.btn_publish, .publish_btn, button[class*="publish"]'
    ).first()
    if (!await publishBtn.isVisible({ timeout: 5000 })) throw new Error('발행 버튼을 찾지 못했습니다.')
    await publishBtn.click()
    console.log('  발행 버튼 클릭')
  })

  // ── 8단계: 공개 설정 팝업 ─────────────────────
  await runStep(editorPage, '공개설정팝업', async () => {
    await editorPage.waitForSelector(
      '[class*="publish"], [class*="open-setting"], .layer_publish, .dialog_publish',
      { timeout: 8000 }
    )
    const publicOption = editorPage.locator(
      'label:has-text("전체공개"), input[value="PUBLIC"] + label, button:has-text("전체공개")'
    ).first()
    if (!await publicOption.isVisible({ timeout: 5000 })) throw new Error('전체공개 옵션을 찾지 못했습니다.')
    await publicOption.click()
    console.log('  전체공개 선택')
  })

  // ── 9단계: 최종 발행 확인 ─────────────────────
  await runStep(editorPage, '최종발행확인', async () => {
    const confirmBtn = editorPage.locator(
      '.layer_publish button:has-text("발행"), .dialog_publish button:has-text("발행"), [class*="publish"] button[class*="confirm"]'
    ).first()
    if (!await confirmBtn.isVisible({ timeout: 5000 })) throw new Error('최종 발행 버튼을 찾지 못했습니다.')
    await confirmBtn.click()
    console.log('  최종 발행 확인')
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

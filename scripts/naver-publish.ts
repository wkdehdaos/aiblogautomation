import { chromium, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

// .env.local / .en.local 파일을 수동으로 로드 (tsx는 자동 로드 안 함)
function loadEnvLocal() {
  const candidates = ['.env.local', '.en.local']
  for (const filename of candidates) {
    const envPath = path.resolve(process.cwd(), filename)
    if (!fs.existsSync(envPath)) continue
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
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

function padIndex() {
  stepIndex++
  return String(stepIndex).padStart(2, '0')
}

async function snap(page: Page, label: string) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filename = `${padIndex()}-${label}.png`
  const filePath = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`  스크린샷 저장: ${filename}`)
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

async function main() {
  if (!BLOG_ID) {
    console.error('NAVER_BLOG_ID 환경변수가 설정되지 않았습니다. .env.local에 추가해 주세요.')
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

  // 에디터 팝업 대비: 새 페이지 열리면 에디터 페이지로 전환
  let editorPage = page

  await runStep(page, '01-블로그홈이동', async () => {
    await page.goto(`https://blog.naver.com/${BLOG_ID}`, { waitUntil: 'domcontentloaded' })
    console.log(`  URL: ${page.url()}`)
  })

  await runStep(page, '02-글쓰기클릭', async () => {
    // 글쓰기 버튼은 새 탭으로 열릴 수 있음
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page.click('a[href*="PostWriteForm"], a:has-text("글쓰기"), button:has-text("글쓰기")', {
        timeout: 10000,
      }),
    ])

    if (newPage) {
      console.log('  글쓰기 에디터가 새 탭으로 열렸습니다.')
      await newPage.waitForLoadState('domcontentloaded')
      editorPage = newPage
    } else {
      await page.waitForURL(/PostWriteForm/, { timeout: 10000 })
    }
    console.log(`  에디터 URL: ${editorPage.url()}`)
  })

  await runStep(editorPage, '03-에디터로드대기', async () => {
    // SmartEditor ONE이 초기화될 때까지 대기
    await editorPage.waitForSelector(
      '.se-title-input, #title, [placeholder*="제목"], .se-placeholder',
      { timeout: 20000 }
    )
  })

  await runStep(editorPage, '04-제목입력', async () => {
    // SmartEditor ONE 제목: contenteditable div 또는 input
    const titleSelectors = [
      '.se-title-input',
      '#title',
      '[contenteditable="true"][class*="title"]',
      '[placeholder*="제목을 입력"]',
    ]
    let clicked = false
    for (const sel of titleSelectors) {
      const el = editorPage.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click()
        await el.fill(TITLE).catch(async () => {
          // contenteditable은 fill이 안 될 수 있어 type으로 대체
          await el.type(TITLE)
        })
        clicked = true
        console.log(`  제목 입력 완료 (셀렉터: ${sel})`)
        break
      }
    }
    if (!clicked) throw new Error('제목 입력란을 찾지 못했습니다.')
  })

  await runStep(editorPage, '05-본문입력', async () => {
    // SmartEditor ONE 본문: iframe 안의 contenteditable 또는 직접 contenteditable
    const iframeEl = editorPage.frameLocator('iframe[id*="se2_iframe"], iframe[title*="에디터"], iframe[class*="se-editor"]').first()
    const bodyInIframe = iframeEl.locator('[contenteditable="true"]').first()

    if (await bodyInIframe.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bodyInIframe.click()
      await bodyInIframe.type(CONTENT)
      console.log('  본문 입력 완료 (iframe 내부)')
      return
    }

    // iframe 없이 직접 contenteditable인 경우
    const bodySelectors = [
      '.se-content-editor [contenteditable="true"]',
      '.se-document [contenteditable="true"]',
      '[contenteditable="true"][class*="se"]',
    ]
    for (const sel of bodySelectors) {
      const el = editorPage.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click()
        await el.type(CONTENT)
        console.log(`  본문 입력 완료 (셀렉터: ${sel})`)
        return
      }
    }

    throw new Error('본문 에디터를 찾지 못했습니다. 스크린샷을 확인해 주세요.')
  })

  if (IMAGE_PATHS.length > 0) {
    await runStep(editorPage, '06-이미지업로드', async () => {
      // 이미지 업로드 버튼 클릭
      const imageBtn = editorPage.locator(
        'button[aria-label*="사진"], button[title*="사진"], .se-toolbar-item-IMAGE, button[class*="image"]'
      ).first()

      if (!await imageBtn.isVisible({ timeout: 5000 })) {
        throw new Error('이미지 업로드 버튼을 찾지 못했습니다.')
      }

      // 파일 input이 나타나길 기다리며 버튼 클릭
      const [fileChooser] = await Promise.all([
        editorPage.waitForEvent('filechooser', { timeout: 5000 }),
        imageBtn.click(),
      ])

      await fileChooser.setFiles(IMAGE_PATHS)
      console.log(`  이미지 ${IMAGE_PATHS.length}개 첨부 완료`)

      // 업로드 완료 대기
      await editorPage.waitForTimeout(3000)
    })
  } else {
    console.log('\n[이미지 업로드] IMAGE_PATHS가 비어있어 건너뜁니다.')
  }

  await runStep(editorPage, '07-발행버튼클릭', async () => {
    const publishBtn = editorPage.locator(
      'button:has-text("발행"), button.btn_publish, .publish_btn, button[class*="publish"]'
    ).first()

    if (!await publishBtn.isVisible({ timeout: 5000 })) {
      throw new Error('발행 버튼을 찾지 못했습니다.')
    }
    await publishBtn.click()
    console.log('  발행 버튼 클릭 완료')
  })

  await runStep(editorPage, '08-공개설정팝업', async () => {
    // 공개설정 팝업 대기
    await editorPage.waitForSelector(
      '[class*="publish"], [class*="open-setting"], .layer_publish, .dialog_publish',
      { timeout: 8000 }
    )

    // 전체공개 선택
    const publicOption = editorPage.locator(
      'label:has-text("전체공개"), input[value="PUBLIC"] + label, button:has-text("전체공개")'
    ).first()

    if (!await publicOption.isVisible({ timeout: 5000 })) {
      throw new Error('전체공개 옵션을 찾지 못했습니다.')
    }
    await publicOption.click()
    console.log('  전체공개 선택 완료')
  })

  await runStep(editorPage, '09-최종발행확인', async () => {
    // 팝업 내 최종 확인 발행 버튼
    const confirmBtn = editorPage.locator(
      '.layer_publish button:has-text("발행"), .dialog_publish button:has-text("발행"), button.btn_ok:has-text("발행"), [class*="publish"] button[class*="confirm"]'
    ).first()

    if (!await confirmBtn.isVisible({ timeout: 5000 })) {
      throw new Error('최종 발행 확인 버튼을 찾지 못했습니다.')
    }
    await confirmBtn.click()
    console.log('  최종 발행 확인 클릭')

    // 발행 완료 후 페이지 이동 대기
    await editorPage.waitForNavigation({ timeout: 15000 }).catch(() => {})
    console.log(`  발행 후 URL: ${editorPage.url()}`)
  })

  await snap(editorPage, '10-발행완료')
  console.log('\n발행이 완료되었습니다.')
  console.log(`스크린샷 폴더: ${SCREENSHOT_DIR}`)

  await browser.close()
}

main().catch((err) => {
  console.error('예기치 못한 오류:', err)
  process.exit(1)
})

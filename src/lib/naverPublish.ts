import { chromium, Page, FrameLocator } from 'playwright'
import path from 'path'
import fs from 'fs'

type LocatorCtx = Page | FrameLocator

export interface PublishSuccess {
  success: true
  url?: string
}

export interface PublishFailure {
  success: false
  error: string
  lastStep: string
}

export type PublishResult = PublishSuccess | PublishFailure

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'debug-screenshots')

async function snap(page: Page, label: string, index: number) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filename = `${String(index).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true }).catch(() => {})
}

async function findEditorCtx(page: Page): Promise<LocatorCtx> {
  if (await page.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false)) {
    return page
  }
  const hasPf = page.frames().some(f => f.url().includes('PostWriteForm'))
  if (hasPf) {
    const fl = page.frameLocator('iframe[src*="PostWriteForm"], iframe').first()
    if (await fl.getByRole('textbox').first().isVisible({ timeout: 15000 }).catch(() => false)) {
      return fl
    }
  }
  const fl = page.frameLocator('iframe').first()
  if (await fl.getByRole('textbox').first().isVisible({ timeout: 5000 }).catch(() => false)) {
    return fl
  }
  throw new Error('에디터를 찾지 못했습니다.')
}

export async function publishToNaver(
  title: string,
  content: string,
  imagePaths: string[]
): Promise<PublishResult> {
  const blogId = process.env.NAVER_BLOG_ID
  let lastStep = '초기화'

  if (!blogId) {
    return { success: false, error: 'NAVER_BLOG_ID 환경변수가 설정되지 않았습니다.', lastStep }
  }
  if (!fs.existsSync(SESSION_PATH)) {
    return { success: false, error: '세션 파일이 없습니다. npm run naver-login 을 먼저 실행해 주세요.', lastStep }
  }

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    storageState: SESSION_PATH,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  let editorPage = page
  let editorCtx: LocatorCtx = page
  let stepIndex = 0

  const step = async (label: string, fn: () => Promise<void>) => {
    lastStep = label
    stepIndex++
    try {
      await fn()
      await snap(editorPage, label, stepIndex)
    } catch (err) {
      await snap(editorPage, `${label}-실패`, stepIndex).catch(() => {})
      throw err
    }
  }

  try {
    // 1. 블로그 홈 이동
    await step('블로그홈이동', async () => {
      await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: 'domcontentloaded' })
    })

    // 2. 글쓰기 클릭
    await step('글쓰기클릭', async () => {
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
    })

    // 3. 에디터 로드 대기 + 초기화
    await step('에디터로드대기', async () => {
      await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await editorPage.waitForTimeout(3000)

      // 임시저장 draft 모달 처리 (취소 = 새 글)
      const draftModal = editorPage.locator('text=작성 중인 글이 있습니다').first()
      if (await draftModal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const cancelBtn = editorPage.locator('.se-popup-alert button').first()
        if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cancelBtn.click()
        } else {
          await editorPage.mouse.click(580, 434)
        }
        await editorPage.waitForTimeout(800)
      }

      // 도움말/플로팅 패널 닫기
      const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
      if (pfFrame) {
        await editorPage.mouse.click(1224, 42).catch(() => {})
        await editorPage.waitForTimeout(400)
        await pfFrame.evaluate(() => {
          document.querySelectorAll<HTMLElement>(
            '.se-floating-material-menu, .se-floating-search, [class*="help"], [class*="layer_help"]'
          ).forEach(el => { el.style.display = 'none' })
        })
        await editorPage.waitForTimeout(300)
      }

      editorCtx = await findEditorCtx(editorPage)
    })

    // 4. 제목 입력
    await step('제목입력', async () => {
      const pfFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
      if (!pfFrame) throw new Error('PostWriteForm 프레임을 찾지 못했습니다.')

      await pfFrame.evaluate(() => {
        document.querySelectorAll<HTMLElement>('.se-floating-material-menu, .se-floating-search').forEach(
          el => { el.style.display = 'none' }
        )
      })

      // draft 모달 재확인
      const draftModal2 = editorCtx.locator('text=작성 중인 글이 있습니다').first()
      if (await draftModal2.isVisible({ timeout: 2000 }).catch(() => false)) {
        const cancelBtn2 = editorCtx.locator('.se-popup-alert button').first()
        if (await cancelBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cancelBtn2.click()
        } else {
          await editorPage.mouse.click(580, 434)
        }
        await editorPage.waitForTimeout(800)
      }

      const iframeBox = await editorPage.locator('iframe[src*="PostWriteForm"]').first().boundingBox()
      if (!iframeBox) throw new Error('iframe 위치를 찾지 못했습니다.')
      await editorPage.mouse.click(iframeBox.x + 315, iframeBox.y + 225)
      await editorPage.waitForTimeout(300)
      await editorPage.keyboard.type(title)
    })

    // 5. 본문 + 이미지 순서대로 입력
    await step('본문입력', async () => {
      const iframeBox = await editorPage.locator('iframe[src*="PostWriteForm"]').first().boundingBox()
      if (!iframeBox) throw new Error('iframe 위치를 찾지 못했습니다.')
      await editorPage.mouse.click(iframeBox.x + 315, iframeBox.y + 350)
      await editorPage.waitForTimeout(300)

      const stripHtml = (html: string) =>
        html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/h[1-6]>/gi, '\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

      // <!--IMAGE_N--> 마커 기준으로 분할 → 텍스트와 이미지 교차 입력
      const parts = content.split(/(<!--IMAGE_\d+-->)/)

      for (const part of parts) {
        const markerMatch = part.match(/<!--IMAGE_(\d+)-->/)
        if (markerMatch) {
          // 이미지 삽입
          const imgIndex = parseInt(markerMatch[1]) - 1
          if (imgIndex < imagePaths.length) {
            const imageBtn = editorCtx.locator('.se-image-toolbar-button').first()
            if (await imageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              const [fileChooser] = await Promise.all([
                editorPage.waitForEvent('filechooser', { timeout: 5000 }),
                imageBtn.click(),
              ])
              await fileChooser.setFiles([imagePaths[imgIndex]])
              await editorPage.waitForTimeout(3000)
              // 이미지 다음 줄로 이동
              await editorPage.keyboard.press('End')
              await editorPage.keyboard.press('Enter')
            }
          }
        } else {
          // 텍스트 입력
          const text = stripHtml(part)
          if (text) {
            await editorPage.keyboard.type(text)
            await editorPage.waitForTimeout(100)
          }
        }
      }
    })

    // 7. 발행 버튼 클릭
    await step('발행버튼클릭', async () => {
      const popupClose = editorCtx.locator('.se-popup-flayer-close-button').first()
      if (await popupClose.isVisible({ timeout: 1000 }).catch(() => false)) {
        await popupClose.click()
        await editorPage.waitForTimeout(500)
      }
      const popupDim = editorCtx.locator('.se-popup-dim').first()
      if (await popupDim.isVisible({ timeout: 1000 }).catch(() => false)) {
        await editorPage.keyboard.press('Escape')
        await editorPage.waitForTimeout(500)
      }

      const publishBtn = editorCtx.locator('button[class*="publish_btn"]').first()
      if (!await publishBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const exact = editorCtx.locator('button').filter({ hasText: /^발행$/ }).first()
        if (!await exact.isVisible({ timeout: 3000 }).catch(() => false)) {
          throw new Error('발행 버튼을 찾지 못했습니다.')
        }
        await exact.click()
      } else {
        await publishBtn.click()
      }
    })

    // 8. 공개 설정 팝업
    await step('공개설정팝업', async () => {
      const popup = editorCtx.locator('text=공개 설정').first()
      if (!await popup.isVisible({ timeout: 10000 }).catch(() => false)) {
        throw new Error('공개 설정 팝업이 나타나지 않았습니다.')
      }
      const publicRadio = editorCtx.locator('label:has-text("전체공개"), input[type="radio"][value*="PUBLIC"]').first()
      if (await publicRadio.isVisible({ timeout: 2000 }).catch(() => false)) {
        await publicRadio.click().catch(() => {})
      }
    })

    // 9. 최종 발행 확인
    await step('최종발행확인', async () => {
      const confirmBtn = editorCtx.locator('button[class*="confirm_btn"]').first()
      if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn.click()
      } else {
        await editorPage.mouse.click(1172, 554)
      }
      await editorPage.waitForNavigation({ timeout: 15000 }).catch(() => {})
    })

    const finalUrl = editorPage.url()
    await snap(editorPage, '발행완료', ++stepIndex)
    await browser.close()

    return { success: true, url: finalUrl }
  } catch (err) {
    await browser.close().catch(() => {})
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      lastStep,
    }
  }
}

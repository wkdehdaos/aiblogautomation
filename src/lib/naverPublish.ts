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

// 도움말·플로팅 패널을 닫는다 — iframe 유무와 무관하게 실행
async function closeHelpPanels(page: Page) {
  // 1. Escape 키로 오버레이 닫기
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(300)

  // 2. JS로 도움말 관련 요소 숨기기 (메인 페이지)
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>(
      '.se-help-panel, [class*="help_panel"], [class*="helpPanel"], ' +
      '.se-floating-material-menu, .se-floating-search, ' +
      '[class*="help"], [class*="layer_help"]'
    ).forEach(el => { el.style.display = 'none' })
  }).catch(() => {})

  // 3. 모든 iframe 내 도움말도 숨기기
  for (const frame of page.frames()) {
    await frame.evaluate(() => {
      document.querySelectorAll<HTMLElement>(
        '.se-help-panel, [class*="help_panel"], ' +
        '.se-floating-material-menu, .se-floating-search, ' +
        '[class*="help"], [class*="layer_help"]'
      ).forEach(el => { el.style.display = 'none' })
    }).catch(() => {})
  }

  await page.waitForTimeout(300)
}

// 작성 중인 글 모달 처리 — 취소(새 글)를 클릭
async function dismissDraftModal(page: Page) {
  const draftText = page.locator('text=작성 중인 글이 있습니다').first()
  if (!await draftText.isVisible({ timeout: 2000 }).catch(() => false)) return

  // "취소" = 새 글 시작
  const cancelBtn = page.locator('button:has-text("취소")').first()
  if (await cancelBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cancelBtn.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(800)
}

// aria-hidden·클립보드용 히든 div를 제외한 실제 에디터 contenteditable 셀렉터
const CE = '[contenteditable="true"]:not([aria-hidden="true"]):not([allow])'

async function findEditorCtx(page: Page): Promise<LocatorCtx> {
  // 1. 메인 페이지에 실제 contenteditable이 있으면 페이지 직접 반환
  const ceOnPage = page.locator(CE).first()
  if (await ceOnPage.isVisible({ timeout: 6000 }).catch(() => false)) {
    return page
  }

  // 2. PostWriteForm iframe
  const pfFrame = page.frames().find(f => f.url().includes('PostWriteForm'))
  if (pfFrame) {
    const fl = page.frameLocator('iframe[src*="PostWriteForm"]')
    if (await fl.locator(CE).first().isVisible({ timeout: 15000 }).catch(() => false)) {
      return fl
    }
  }

  // 3. 다른 iframe 순회
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    try {
      const src = frame.url()
      if (!src) continue
      const fl = page.frameLocator(`iframe[src="${src}"]`)
      if (await fl.locator(CE).first().isVisible({ timeout: 3000 }).catch(() => false)) {
        return fl
      }
    } catch { continue }
  }

  // 4. 마지막 수단 — 페이지 반환 (이후 단계에서 재시도)
  return page
}

// editorCtx 에서 실제 에디터 contenteditable 요소를 클릭 (히든 div 제외)
async function clickEditorArea(editorPage: Page, editorCtx: LocatorCtx, nth: number) {
  const ce = editorCtx.locator(CE).nth(nth)
  if (await ce.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ce.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
    await ce.click({ timeout: 5000 })
    return
  }
  // iframe 좌표 폴백
  const iframeBox = await editorPage.locator('iframe[src*="PostWriteForm"]').first().boundingBox().catch(() => null)
  if (iframeBox) {
    await editorPage.mouse.click(iframeBox.x + 315, nth === 0 ? iframeBox.y + 225 : iframeBox.y + 350)
  }
}

export async function publishToNaver(
  title: string,
  content: string,
  imagePaths: string[],
  font = '나눔고딕',
  location = ''
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

    // 3. 에디터 로드 대기
    await step('에디터로드대기', async () => {
      await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await editorPage.waitForTimeout(2000)

      // 도움말·플로팅 패널 닫기 (iframe 여부 무관)
      await closeHelpPanels(editorPage)

      // 작성 중인 글 모달 처리
      await dismissDraftModal(editorPage)

      // 에디터 컨텍스트 탐색
      editorCtx = await findEditorCtx(editorPage)
    })

    // 4. 제목 입력
    await step('제목입력', async () => {
      // 모달이 늦게 뜰 수 있어 재확인
      await dismissDraftModal(editorPage)
      await closeHelpPanels(editorPage)

      // 제목 contenteditable (첫 번째) 클릭
      await clickEditorArea(editorPage, editorCtx, 0)
      await editorPage.waitForTimeout(300)
      await editorPage.keyboard.type(title)
    })

    // 5. 본문 + 이미지 입력
    await step('본문입력', async () => {
      // 본문 contenteditable (두 번째) 클릭
      await clickEditorArea(editorPage, editorCtx, 1)
      await editorPage.waitForTimeout(300)

      // 서체 선택
      const fontBtn = editorCtx.locator('.se-font-family-toolbar-button').first()
      if (await fontBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await fontBtn.click()
        await editorPage.waitForTimeout(500)
        const fontOption = editorCtx.locator(`button:has-text("${font}"), [title="${font}"]`).first()
        if (await fontOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await fontOption.click()
          await editorPage.waitForTimeout(300)
        } else {
          await editorPage.keyboard.press('Escape')
        }
      }

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
          .replace(/&ldquo;/g, '“')
          .replace(/&rdquo;/g, '”')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

      const parts = content.split(/(<!--IMAGE_\d+-->)/)

      for (const part of parts) {
        const markerMatch = part.match(/<!--IMAGE_(\d+)-->/)
        if (markerMatch) {
          const imgIndex = parseInt(markerMatch[1]) - 1
          if (imgIndex < imagePaths.length) {
            const imageBtn = editorCtx.locator('.se-image-toolbar-button').first()
            if (await imageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              const [fileChooser] = await Promise.all([
                editorPage.waitForEvent('filechooser', { timeout: 5000 }),
                imageBtn.click(),
              ])
              await fileChooser.setFiles([imagePaths[imgIndex]])
              await editorPage.waitForTimeout(2000)

              const layoutPopup = editorCtx.locator('.se-photo-upload-layer, .se-popup-photo, [class*="photo_layer"], [class*="photoUpload"]').first()
              if (await layoutPopup.isVisible({ timeout: 3000 }).catch(() => false)) {
                const singlePhoto = editorCtx.locator(
                  'button:has-text("개별사진"), label:has-text("개별사진"), [class*="single"], [class*="individual"]'
                ).first()
                if (await singlePhoto.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await singlePhoto.click()
                  await editorPage.waitForTimeout(300)
                }
                const insertBtn = editorCtx.locator(
                  'button:has-text("삽입"), button:has-text("확인"), button:has-text("적용")'
                ).first()
                if (await insertBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                  await insertBtn.click()
                  await editorPage.waitForTimeout(1000)
                }
              } else {
                await editorPage.waitForTimeout(2000)
              }

              await editorPage.keyboard.press('End')
              await editorPage.keyboard.press('Enter')
            }
          }
        } else {
          const text = stripHtml(part)
          if (text) {
            await editorPage.keyboard.type(text)
            await editorPage.waitForTimeout(100)
          }
        }
      }
    })

    // 6. 위치 지도 삽입
    if (location) {
      await step('위치지도삽입', async () => {
        await editorPage.keyboard.press('Control+End')
        await editorPage.waitForTimeout(300)
        await editorPage.keyboard.press('Enter')

        const mapBtn = editorCtx.locator('.se-map-toolbar-button').first()
        if (!await mapBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          throw new Error('장소 추가 버튼을 찾지 못했습니다.')
        }
        await mapBtn.click()
        await editorPage.waitForTimeout(1500)

        const searchSelectors = 'input[placeholder*="장소"], input[placeholder*="검색"], input[type="search"], .se-map-search-input'
        let searchInput = editorCtx.locator(searchSelectors).first()
        if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          searchInput = editorPage.locator(searchSelectors).first()
        }

        if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
          await searchInput.fill(location)
          await searchInput.press('Enter')
          await editorPage.waitForTimeout(2500)

          const resultSelectors = '.se-map-item, .se-place-item, [class*="map_item"], [class*="place_item"], [class*="PlaceItem"], li[class*="item"]'
          let firstResult = editorCtx.locator(resultSelectors).first()
          if (!await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
            firstResult = editorPage.locator(resultSelectors).first()
          }
          if (await firstResult.isVisible({ timeout: 5000 }).catch(() => false)) {
            await firstResult.click()
            await editorPage.waitForTimeout(1000)
          }

          const confirmSelectors = 'button:has-text("추가"), button:has-text("확인"), button:has-text("삽입"), button:has-text("완료")'
          let confirmClicked = false

          const confirmBtnPage = editorPage.locator(confirmSelectors).last()
          if (await confirmBtnPage.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtnPage.click()
            confirmClicked = true
          }
          if (!confirmClicked) {
            const confirmBtnCtx = editorCtx.locator(confirmSelectors).last()
            if (await confirmBtnCtx.isVisible({ timeout: 3000 }).catch(() => false)) {
              await confirmBtnCtx.click()
              confirmClicked = true
            }
          }
          if (!confirmClicked) {
            for (const frame of editorPage.frames()) {
              const btn = frame.locator(confirmSelectors).last()
              if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                await btn.click()
                confirmClicked = true
                break
              }
            }
          }
          if (!confirmClicked) {
            await editorPage.keyboard.press('Enter')
          }

          await editorPage.waitForTimeout(1500)
        }
      })
    }

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

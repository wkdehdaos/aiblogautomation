import { chromium, Page, FrameLocator, Locator } from 'playwright'
import path from 'path'
import fs from 'fs'

type LocatorCtx = Page | FrameLocator

export interface PublishSuccess { success: true; url?: string }
export interface PublishFailure { success: false; error: string; lastStep: string }
export type PublishResult = PublishSuccess | PublishFailure

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'debug-screenshots')

// aria-hidden·클립보드 히든 div 제외한 실제 에디터 contenteditable
const CE = '[contenteditable="true"]:not([aria-hidden="true"]):not([allow])'

let _snapDirReady = false
async function snap(page: Page, label: string, index: number) {
  if (!_snapDirReady) { fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }); _snapDirReady = true }
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${String(index).padStart(2, '0')}-${label}.png`),
    fullPage: true,
  }).catch(() => {})
}

async function closeHelpPanels(page: Page) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(150)
  await Promise.allSettled(
    [page.mainFrame(), ...page.frames()].map(frame =>
      frame.evaluate(() => {
        document.querySelectorAll<HTMLElement>(
          '.se-help-panel,[class*="help_panel"],[class*="helpPanel"],' +
          '.se-floating-material-menu,.se-floating-search,' +
          '[class*="help"],[class*="layer_help"]'
        ).forEach(el => { el.style.display = 'none' })
      }).catch(() => {})
    )
  )
}

async function dismissDraftModal(page: Page) {
  const modal = page.locator('text=작성 중인 글이 있습니다').first()
  if (!await modal.isVisible({ timeout: 1500 }).catch(() => false)) return
  const cancelBtn = page.locator('button:has-text("취소")').first()
  if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cancelBtn.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(600)
}

// PostWriteForm iframe 우선 → 메인 페이지 순으로 탐색
async function findEditorCtx(page: Page): Promise<LocatorCtx> {
  const pfExists = page.frames().some(f => f.url().includes('PostWriteForm'))
  if (pfExists) {
    const fl = page.frameLocator('iframe[src*="PostWriteForm"]')
    const visible = await fl.locator(CE).first().isVisible({ timeout: 12000 }).catch(() => false)
    if (visible) return fl
  }
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue
    const src = frame.url()
    if (!src) continue
    try {
      const fl = page.frameLocator(`iframe[src="${src}"]`)
      if (await fl.locator(CE).first().isVisible({ timeout: 1500 }).catch(() => false)) return fl
    } catch { continue }
  }
  return page
}

async function findToolbarBtn(ctx: LocatorCtx, ...selectors: string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const btn = ctx.locator(sel).first()
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) return btn
    } catch { continue }
  }
  return null
}

async function pasteHtml(page: Page, html: string) {
  await page.evaluate((h) => {
    const item = new ClipboardItem({
      'text/html': new Blob([h], { type: 'text/html' }),
      'text/plain': new Blob([h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()], { type: 'text/plain' }),
    })
    return navigator.clipboard.write([item])
  }, html)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
}

// 본문 CE 확보 — iframe 기반 접근을 1순위로
async function focusBodyCE(editorCtx: LocatorCtx, editorPage: Page): Promise<Locator | null> {
  // 1순위: 사용자가 지정한 iframe 셀렉터로 본문 직접 접근
  const iframeBodyCandidates: Array<[string, string[]]> = [
    ['iframe#se_iframe', [
      '.se-content div[contenteditable="true"]',
      '.se-content [contenteditable="true"]',
      '[contenteditable="true"]',
    ]],
    ['iframe[title="본문 에디터"]', [
      '.se-content div[contenteditable="true"]',
      '.se-content [contenteditable="true"]',
      '[contenteditable="true"]',
    ]],
    ['iframe[src*="PostWriteForm"]', [
      '.se-content div[contenteditable="true"]',
      '[class*="se-main-container"] ' + CE,
      '[class*="se_content"] ' + CE,
    ]],
  ]

  for (const [iframeSel, bodySelectors] of iframeBodyCandidates) {
    const iframeEl = editorPage.locator(iframeSel).first()
    if (!await iframeEl.isVisible({ timeout: 800 }).catch(() => false)) continue
    const frame = editorPage.frameLocator(iframeSel)
    for (const bodySel of bodySelectors) {
      const loc = frame.locator(bodySel).first()
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loc.click({ timeout: 3000 }).catch(() => {})
        await editorPage.waitForTimeout(300)
        return loc
      }
    }
  }

  // 2순위: editorCtx 내 SE4 메인 컨테이너 하위 CE
  const specificSelectors = [
    '[class*="se-main-container"] ' + CE,
    '[class*="se_content"] '        + CE,
    '[class*="content_wrap"] '      + CE,
    '[class*="se-content"] '        + CE,
    '[class*="editor_body"] '       + CE,
  ]
  for (const sel of specificSelectors) {
    const loc = editorCtx.locator(sel).first()
    if (await loc.isVisible({ timeout: 600 }).catch(() => false)) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await editorPage.waitForTimeout(250)
      return loc
    }
  }

  // 3순위: Tab 키로 포커스 이동 후 마지막 CE
  await editorPage.keyboard.press('Tab')
  await editorPage.waitForTimeout(300)
  const lastCE = editorCtx.locator(CE).last()
  if (await lastCE.isVisible({ timeout: 1000 }).catch(() => false)) {
    await lastCE.click({ timeout: 3000 }).catch(() => {})
    await editorPage.waitForTimeout(250)
    return lastCE
  }

  // 4순위: iframe 좌표 클릭 (제목 영역 아래 35%)
  for (const [iframeSel] of iframeBodyCandidates) {
    const iframeBox = await editorPage.locator(iframeSel).first().boundingBox().catch(() => null)
    if (iframeBox) {
      await editorPage.mouse.click(
        iframeBox.x + iframeBox.width / 2,
        iframeBox.y + Math.max(iframeBox.height * 0.35, 200),
      )
      await editorPage.waitForTimeout(250)
      return null
    }
  }

  return null
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

  if (!blogId) return { success: false, error: 'NAVER_BLOG_ID 환경변수 미설정', lastStep }
  if (!fs.existsSync(SESSION_PATH)) return { success: false, error: '세션 없음. npm run naver-login 먼저', lastStep }

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
      await snap(editorPage, '페이지로드', 1)  // 01-페이지로드.png
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
      await editorPage.waitForTimeout(1500)
      await closeHelpPanels(editorPage)
      await dismissDraftModal(editorPage)
      editorCtx = await findEditorCtx(editorPage)
    })

    // 4. 제목 입력
    await step('제목입력', async () => {
      const titleSelectors = [
        '.se-title-text',
        'input[class*="title"]',
        'textarea[class*="title"]',
        '[class*="se_title"] input',
        '[class*="title_area"] input',
        '[placeholder*="제목"]',
      ]
      let clicked = false
      for (const sel of titleSelectors) {
        const el = editorCtx.locator(sel).first()
        if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
          await el.click({ timeout: 3000 })
          await editorPage.waitForTimeout(300)
          const tag = await el.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => 'div')
          if (tag === 'input' || tag === 'textarea') {
            await el.fill(title)
          } else {
            await editorPage.keyboard.type(title)
          }
          clicked = true
          break
        }
      }

      if (!clicked) {
        const titleCE = editorCtx.locator(CE).nth(0)
        if (await titleCE.isVisible({ timeout: 3000 }).catch(() => false)) {
          await titleCE.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
          await titleCE.click({ timeout: 3000 })
        } else {
          const box = await editorPage.locator('iframe[src*="PostWriteForm"]').first().boundingBox().catch(() => null)
          if (box) await editorPage.mouse.click(box.x + 315, box.y + 225)
        }
        await editorPage.waitForTimeout(300)
        await editorPage.keyboard.type(title)
      }

      // 제목 입력 완료 후 포커스를 본문으로 명시적 이동
      await editorPage.keyboard.press('Escape')
      await editorPage.waitForTimeout(500)
      await editorPage.keyboard.press('Tab')
      await editorPage.waitForTimeout(1000)
      await snap(editorPage, '제목입력후', 2)  // 02-제목입력후.png
    })

    // 5. 본문 입력
    await step('본문입력', async () => {
      // 본문 CE 클릭 — iframe 기반 접근 우선
      const bodyCE = await focusBodyCE(editorCtx, editorPage)
      await editorPage.waitForTimeout(1000)
      await snap(editorPage, '본문클릭후', 3)  // 03-본문클릭후.png

      // 서체 선택
      const fontBtn = await findToolbarBtn(editorCtx,
        '.se-font-family-toolbar-button',
        'button[class*="font_family"]',
        'button[aria-label*="서체"]',
      )
      if (fontBtn) {
        await fontBtn.click()
        await editorPage.waitForTimeout(400)
        const fontOption = editorCtx.locator(`button:has-text("${font}"), [title="${font}"]`).first()
        if (await fontOption.isVisible({ timeout: 1500 }).catch(() => false)) {
          await fontOption.click()
          await editorPage.waitForTimeout(200)
        } else {
          await editorPage.keyboard.press('Escape')
        }
        // 서체 선택 후 본문 포커스 복귀
        if (bodyCE) {
          await bodyCE.click({ timeout: 3000 }).catch(() => {})
          await editorPage.waitForTimeout(300)
        } else {
          await focusBodyCE(editorCtx, editorPage)
          await editorPage.waitForTimeout(300)
        }
      }

      // <!--IMAGE_N--> 마커 기준 분할 → HTML 붙여넣기 + 이미지 교차 삽입
      const parts = content.split(/(<!--IMAGE_\d+-->)/)

      for (const part of parts) {
        const markerMatch = part.match(/<!--IMAGE_(\d+)-->/)
        if (markerMatch) {
          const imgIndex = parseInt(markerMatch[1]) - 1
          if (imgIndex < imagePaths.length) {
            const imageBtn = await findToolbarBtn(editorCtx,
              '.se-image-toolbar-button',
              '.se-photo-toolbar-button',
              'button[class*="image"][class*="toolbar"]',
              'button[class*="photo"][class*="toolbar"]',
              'button[aria-label="사진"]',
              'button[title="사진"]',
              'button[data-module-name="photo"]',
            )
            if (imageBtn) {
              const [fileChooser] = await Promise.all([
                editorPage.waitForEvent('filechooser', { timeout: 5000 }),
                imageBtn.click(),
              ])
              await fileChooser.setFiles([imagePaths[imgIndex]])
              await editorPage.waitForTimeout(1800)

              const layoutPopup = editorCtx.locator(
                '.se-photo-upload-layer,.se-popup-photo,[class*="photo_layer"],[class*="photoUpload"]'
              ).first()
              if (await layoutPopup.isVisible({ timeout: 2000 }).catch(() => false)) {
                const singlePhoto = editorCtx.locator(
                  'button:has-text("개별사진"),label:has-text("개별사진"),[class*="single"],[class*="individual"]'
                ).first()
                if (await singlePhoto.isVisible({ timeout: 1500 }).catch(() => false)) {
                  await singlePhoto.click()
                  await editorPage.waitForTimeout(200)
                }
                const insertBtn = editorCtx.locator(
                  'button:has-text("삽입"),button:has-text("확인"),button:has-text("적용")'
                ).first()
                if (await insertBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                  await insertBtn.click()
                  await editorPage.waitForTimeout(800)
                }
              } else {
                await editorPage.waitForTimeout(1500)
              }
              await editorPage.keyboard.press('End')
              await editorPage.keyboard.press('Enter')
            }
          }
        } else {
          const htmlPart = part.trim()
          if (htmlPart) {
            // 붙여넣기 전 본문 포커스 재확인
            if (bodyCE) await bodyCE.click({ timeout: 2000 }).catch(() => {})
            await pasteHtml(editorPage, htmlPart)
          }
        }
      }

      await snap(editorPage, '본문입력후', 4)  // 04-본문입력후.png
    })

    // 6. 위치 지도 삽입
    if (location) {
      await step('위치지도삽입', async () => {
        await editorPage.keyboard.press('Control+End')
        await editorPage.waitForTimeout(200)
        await editorPage.keyboard.press('Enter')

        const mapBtn = await findToolbarBtn(editorCtx,
          '.se-map-toolbar-button',
          '.se-place-toolbar-button',
          'button[class*="map"][class*="toolbar"]',
          'button[class*="place"][class*="toolbar"]',
          'button[aria-label="장소"]',
          'button[title="장소"]',
          'button[data-module-name="map"]',
          'button[data-module-name="place"]',
        )
        if (!mapBtn) throw new Error('장소 추가 버튼을 찾지 못했습니다.')
        await mapBtn.click()
        await editorPage.waitForTimeout(1000)

        const searchSelectors = 'input[placeholder*="장소"],input[placeholder*="검색"],input[type="search"],.se-map-search-input'
        let searchInput = editorCtx.locator(searchSelectors).first()
        if (!await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          searchInput = editorPage.locator(searchSelectors).first()
        }

        if (await searchInput.isVisible({ timeout: 4000 }).catch(() => false)) {
          await searchInput.fill(location)
          await searchInput.press('Enter')
          await editorPage.waitForTimeout(2000)

          const resultSelectors = '.se-map-item,.se-place-item,[class*="map_item"],[class*="place_item"],[class*="PlaceItem"],li[class*="item"]'
          let firstResult = editorCtx.locator(resultSelectors).first()
          if (!await firstResult.isVisible({ timeout: 2000 }).catch(() => false)) {
            firstResult = editorPage.locator(resultSelectors).first()
          }
          if (await firstResult.isVisible({ timeout: 4000 }).catch(() => false)) {
            await firstResult.click()
            await editorPage.waitForTimeout(800)
          }

          const confirmSel = 'button:has-text("추가"),button:has-text("확인"),button:has-text("삽입"),button:has-text("완료")'
          let confirmed = false
          for (const locator of [editorPage.locator(confirmSel).last(), editorCtx.locator(confirmSel).last()]) {
            if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
              await locator.click()
              confirmed = true
              break
            }
          }
          if (!confirmed) {
            for (const frame of editorPage.frames()) {
              const btn = frame.locator(confirmSel).last()
              if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
                await btn.click()
                confirmed = true
                break
              }
            }
          }
          if (!confirmed) await editorPage.keyboard.press('Enter')
          await editorPage.waitForTimeout(1000)
        }
      })
    }

    // 7. 발행 버튼 클릭
    await step('발행버튼클릭', async () => {
      const dim = editorCtx.locator('.se-popup-dim').first()
      if (await dim.isVisible({ timeout: 800 }).catch(() => false)) {
        await editorPage.keyboard.press('Escape')
        await editorPage.waitForTimeout(400)
      }

      let publishBtn = await findToolbarBtn(editorCtx,
        'button[class*="publish_btn"]',
        'button:has-text("발행")',
      )
      if (!publishBtn) {
        publishBtn = await findToolbarBtn(editorPage,
          'button[class*="publish_btn"]',
          'button:has-text("발행")',
        )
      }
      if (!publishBtn) throw new Error('발행 버튼을 찾지 못했습니다.')
      await publishBtn.click()
    })

    // 8. 공개 설정 팝업
    await step('공개설정팝업', async () => {
      const popup = editorCtx.locator('text=공개 설정').first()
      if (!await popup.isVisible({ timeout: 10000 }).catch(() => false)) {
        throw new Error('공개 설정 팝업이 나타나지 않았습니다.')
      }
      const publicRadio = editorCtx.locator('label:has-text("전체공개"),input[type="radio"][value*="PUBLIC"]').first()
      if (await publicRadio.isVisible({ timeout: 1500 }).catch(() => false)) {
        await publicRadio.click().catch(() => {})
      }
    })

    // 9. 최종 발행 확인
    await step('최종발행확인', async () => {
      const confirmBtn = editorCtx.locator('button[class*="confirm_btn"]').first()
      if (await confirmBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await confirmBtn.click()
      } else {
        await editorPage.mouse.click(1172, 554)
      }
      await editorPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
    })

    const finalUrl = editorPage.url()
    await snap(editorPage, '발행완료', ++stepIndex)
    await browser.close()
    return { success: true, url: finalUrl }
  } catch (err) {
    await browser.close().catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err), lastStep }
  }
}

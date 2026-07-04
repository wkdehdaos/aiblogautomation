import { chromium, Page, FrameLocator, Locator } from 'playwright'
import path from 'path'
import fs from 'fs'

type LocatorCtx = Page | FrameLocator

export interface PublishSuccess { success: true; url?: string }
export interface PublishFailure { success: false; error: string; lastStep: string }
export type PublishResult = PublishSuccess | PublishFailure

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'debug-screenshots')

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
  // 메인 페이지 + 모든 iframe 순회하여 임시저장 모달 찾기
  const contexts = [page, ...page.frames().map(f => page.frameLocator(`iframe[src="${f.url()}"]`))]
  for (const ctx of [page, ...page.frames()]) {
    const locator = ctx === page
      ? page.locator('text=작성 중인 글이 있습니다').first()
      : (page.frameLocator(`iframe[src="${(ctx as import('playwright').Frame).url()}"]`)).locator('text=작성 중인 글이 있습니다').first()
    if (!await locator.isVisible({ timeout: 800 }).catch(() => false)) continue

    // 모달 발견 → 취소(거절) 클릭
    const cancelBtn = ctx === page
      ? page.locator('button:has-text("취소")').first()
      : (page.frameLocator(`iframe[src="${(ctx as import('playwright').Frame).url()}"]`)).locator('button:has-text("취소")').first()

    if (await cancelBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await cancelBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(600)
    return
  }
  void contexts // suppress unused warning
}

// PostWriteForm iframe 우선 → 메인 페이지 순으로 탐색
async function findEditorCtx(page: Page): Promise<LocatorCtx> {
  const CE = '[contenteditable="true"]:not([aria-hidden="true"]):not([allow])'
  if (page.frames().some(f => f.url().includes('PostWriteForm'))) {
    const fl = page.frameLocator('iframe[src*="PostWriteForm"]')
    if (await fl.locator(CE).first().isVisible({ timeout: 12000 }).catch(() => false)) return fl
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

// 모든 프레임을 순회해서 본문 텍스트를 읽음
async function getBodyText(editorPage: Page): Promise<string> {
  // 1) 메인 페이지 컨텍스트
  const main = await editorPage.evaluate(() =>
    document.querySelector('.se-content')?.textContent?.trim() ?? ''
  ).catch(() => '')
  if (main) return main

  // 2) iframe 순회
  for (const frame of editorPage.frames()) {
    const text = await frame.evaluate(() => {
      const sel = [
        '.se-content',
        '.se-main-container [contenteditable="true"]',
        '[contenteditable="true"]',
      ]
      for (const s of sel) {
        const el = document.querySelector(s)
        if (el?.textContent?.trim()) return el.textContent.trim()
      }
      return ''
    }).catch(() => '')
    if (text) return text
  }
  return ''
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
    // ── 1. 블로그 홈 이동 ────────────────────────────────────────────
    await step('블로그홈이동', async () => {
      await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: 'domcontentloaded' })
      await snap(editorPage, '블로그홈', 1)
    })

    // ── 2. 글쓰기 클릭 ───────────────────────────────────────────────
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

    // ── 3. 에디터 로드 대기 (2초) ───────────────────────────────────
    await step('에디터로드대기', async () => {
      await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await editorPage.waitForTimeout(2000)   // 글쓰기 페이지 로드 후 2초 대기
      await closeHelpPanels(editorPage)
      await dismissDraftModal(editorPage)
      editorCtx = await findEditorCtx(editorPage)
      await snap(editorPage, '에디터로드후', 3)
    })

    // ── 4. 제목 입력 ─────────────────────────────────────────────────
    await step('제목입력', async () => {
      // 새 셀렉터 우선, 이후 기존 셀렉터 폴백
      const titleSelectors = [
        '.se-title-input',
        '[placeholder="제목"]',
        '.se-title-text',
        'input[class*="title"]',
        'textarea[class*="title"]',
        '[class*="se_title"] input',
        '[class*="title_area"] input',
        '[placeholder*="제목"]',
      ]

      let titleEntered = false
      for (const sel of titleSelectors) {
        for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
          const el = ctx.locator(sel).first()
          if (!await el.isVisible({ timeout: 1000 }).catch(() => false)) continue
          await el.click({ timeout: 3000 })
          await editorPage.waitForTimeout(300)
          const tag = await el.evaluate((n) => (n as HTMLElement).tagName.toLowerCase()).catch(() => 'div')
          if (tag === 'input' || tag === 'textarea') {
            await el.fill(title)
          } else {
            await editorPage.keyboard.type(title)
          }
          console.log(`[title] 셀렉터 성공: ${sel}`)
          titleEntered = true
          break
        }
        if (titleEntered) break
      }

      if (!titleEntered) {
        // 폴백: iframe 상단 좌표 클릭
        const box = await editorPage.locator('iframe[src*="PostWriteForm"]').first().boundingBox().catch(() => null)
        if (box) {
          await editorPage.mouse.click(box.x + box.width / 2, box.y + 150)
          await editorPage.waitForTimeout(300)
          await editorPage.keyboard.type(title)
          console.log('[title] 좌표 폴백으로 입력')
        } else {
          throw new Error('제목 입력 영역을 찾지 못했습니다.')
        }
      }

      // 04-제목입력후.png
      await snap(editorPage, '제목입력후', 4)

      // Enter로 본문으로 이동 (셀렉터 없이 키보드만 사용)
      await editorPage.keyboard.press('Enter')
      await editorPage.waitForTimeout(1000)

      // 05-본문이동후.png
      await snap(editorPage, '본문이동후', 5)
    })

    // ── 5. 본문 + 이미지 입력 ────────────────────────────────────────
    await step('본문및이미지입력', async () => {
      const CE = '[contenteditable="true"]:not([aria-hidden="true"])'

      // 에디터 포커스 — step4 Enter 후 이미 본문에 있을 수 있으므로
      // isVisible 짧게 확인 후 클릭, 안 되면 그냥 진행
      for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
        const el = ctx.locator(CE).first()
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click({ timeout: 5000 }).catch(() => {})
          break
        }
      }
      // 프레임 직접 순회
      if (editorPage.frames().length > 1) {
        for (const frame of editorPage.frames()) {
          if (!frame.url()) continue
          const el = frame.locator(CE).first()
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            await el.click({ timeout: 3000 }).catch(() => {})
            break
          }
        }
      }
      await editorPage.waitForTimeout(400)

      // content를 HTML 섹션과 이미지 마커로 분리
      type Section = { type: 'html'; html: string } | { type: 'img'; idx: number }
      const sections: Section[] = []
      const parts = content.split(/(<!--IMAGE_\d+-->)/)
      for (const part of parts) {
        const m = part.match(/<!--IMAGE_(\d+)-->/)
        if (m) {
          sections.push({ type: 'img', idx: parseInt(m[1]) - 1 })
        } else if (part.trim()) {
          sections.push({ type: 'html', html: part })
        }
      }
      if (sections.length === 0) sections.push({ type: 'html', html: content })

      // PostWriteForm 프레임 (클립보드·execCommand용)
      const editorFrame = editorPage.frames().find(f => f.url().includes('PostWriteForm'))
        ?? editorPage.mainFrame()

      let bodyVerified = false

      for (const section of sections) {
        if (section.type === 'html') {
          // 1순위: execCommand insertHTML (프레임 내에서 직접 실행 — 가장 안정적)
          const inserted = await editorFrame.evaluate((html: string) => {
            const el = document.querySelector<HTMLElement>('[contenteditable="true"]:not([aria-hidden])')
            if (!el) return false
            el.focus()
            return document.execCommand('insertHTML', false, html)
          }, section.html).catch(() => false)

          if (inserted) {
            await editorPage.waitForTimeout(600)
          } else {
            // 2순위: 클립보드 → Ctrl+V (프레임 컨텍스트에서 write)
            const canClipboard = await editorFrame.evaluate(async (html: string) => {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) }),
                ])
                return true
              } catch { return false }
            }, section.html).catch(() => false)

            if (canClipboard) {
              await editorPage.keyboard.press('Control+V')
              await editorPage.waitForTimeout(900)
            } else {
              // 3순위: 다른 프레임 모두 시도
              for (const frame of editorPage.frames()) {
                const ok = await frame.evaluate((html: string) => {
                  const el = document.querySelector<HTMLElement>('[contenteditable="true"]:not([aria-hidden])')
                  if (!el) return false
                  el.focus()
                  return document.execCommand('insertHTML', false, html)
                }, section.html).catch(() => false)
                if (ok) { await editorPage.waitForTimeout(600); break }
              }
            }
          }
          bodyVerified = true

        } else {
          // 이미지 삽입 (커서 현재 위치 기준)
          const imgPath = imagePaths[section.idx]
          if (!imgPath) continue

          await editorPage.keyboard.press('End')
          await editorPage.keyboard.press('Enter')
          await editorPage.waitForTimeout(300)

          const imgBase64 = fs.readFileSync(imgPath).toString('base64')
          const imgMime = imgPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
          const imgName = `photo-${section.idx + 1}.jpg`

          // ── 방법 A: JS로 File 객체 생성 → file input change 이벤트 트리거
          //   (파일 다이얼로그 없이, 이미 메모리에 있는 이미지를 직접 주입)
          let uploaded = false
          for (const frame of [editorFrame, ...editorPage.frames()]) {
            const result = await frame.evaluate(
              async ({ b64, mime, name }: { b64: string; mime: string; name: string }) => {
                const byteStr = atob(b64)
                const ab = new ArrayBuffer(byteStr.length)
                const ia = new Uint8Array(ab)
                for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
                const file = new File([ab], name, { type: mime })

                // file input 탐색
                const input = document.querySelector<HTMLInputElement>('input[type="file"]')
                if (!input) return null

                const dt = new DataTransfer()
                dt.items.add(file)
                Object.defineProperty(input, 'files', { value: dt.files, writable: false })
                input.dispatchEvent(new Event('change', { bubbles: true }))
                input.dispatchEvent(new Event('input', { bubbles: true }))
                return 'injected'
              },
              { b64: imgBase64, mime: imgMime, name: imgName }
            ).catch(() => null)

            if (result === 'injected') {
              // SE3가 이미지를 처리할 시간
              await editorPage.waitForTimeout(3000)
              uploaded = true
              console.log(`[img] ${section.idx + 1}번 JS 직접 주입 성공`)
              break
            }
          }

          // ── 방법 B: 이미지 버튼 클릭 → file input에 주입 (패널이 열린 뒤 input 생김)
          if (!uploaded) {
            const imgBtnSels = [
              '.se-image-toolbar-button',
              '.se-insert-menu-button-image',
              'button[class*="image"][class*="toolbar"]',
            ]
            let imageBtn: Locator | null = null
            for (const sel of imgBtnSels) {
              for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
                const btn = ctx.locator(sel).first()
                if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
                  imageBtn = btn; break
                }
              }
              if (imageBtn) break
            }

            if (imageBtn) {
              // filechooser도 함께 대기 (패널이 직접 다이얼로그를 여는 버전 대응)
              const chooserPromise = editorPage.waitForEvent('filechooser', { timeout: 8_000 }).catch(() => null)
              await imageBtn.click()
              await editorPage.waitForTimeout(800)

              // 패널 열린 뒤 file input 주입 재시도
              for (const frame of [editorFrame, ...editorPage.frames()]) {
                const result = await frame.evaluate(
                  async ({ b64, mime, name }: { b64: string; mime: string; name: string }) => {
                    const byteStr = atob(b64)
                    const ab = new ArrayBuffer(byteStr.length)
                    const ia = new Uint8Array(ab)
                    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
                    const file = new File([ab], name, { type: mime })
                    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
                    if (!input) return null
                    const dt = new DataTransfer()
                    dt.items.add(file)
                    Object.defineProperty(input, 'files', { value: dt.files, writable: false })
                    input.dispatchEvent(new Event('change', { bubbles: true }))
                    return 'injected'
                  },
                  { b64: imgBase64, mime: imgMime, name: imgName }
                ).catch(() => null)

                if (result === 'injected') {
                  await editorPage.waitForTimeout(3000)
                  uploaded = true
                  console.log(`[img] ${section.idx + 1}번 패널 후 JS 주입 성공`)
                  break
                }
              }

              // JS 주입도 실패 → filechooser 폴백
              if (!uploaded) {
                // "내 PC" 버튼 클릭 시도
                const pcSels = ['button:has-text("내 PC")', 'button:has-text("내 PC에서")',
                  'button:has-text("직접")', '[class*="local"]', '[class*="upload_btn"]']
                for (const frame of [editorFrame, ...editorPage.frames()]) {
                  for (const sel of pcSels) {
                    const btn = frame.locator(sel).first()
                    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
                      await btn.click(); break
                    }
                  }
                }
                const fileChooser = await chooserPromise
                if (fileChooser) {
                  await fileChooser.setFiles([imgPath])
                  await editorPage.waitForTimeout(2500)
                  uploaded = true
                  console.log(`[img] ${section.idx + 1}번 filechooser 업로드`)
                }
              }
            }
          }

          // ── 업로드 실패 시 패널 닫고 계속 진행
          if (!uploaded) {
            console.log(`[img] ${section.idx + 1}번 업로드 실패 — 패널 닫고 건너뜀`)
            await editorPage.keyboard.press('Escape')
            await editorPage.waitForTimeout(400)
            continue
          }

          // 삽입 버튼 처리 (레이아웃 팝업)
          for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
            const singleBtn = ctx.locator('button:has-text("개별사진"),label:has-text("개별사진")').first()
            if (await singleBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await singleBtn.click()
              await editorPage.waitForTimeout(300)
              break
            }
          }
          for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
            const insertBtn = ctx.locator('button:has-text("삽입"),button:has-text("확인"),button:has-text("적용")').first()
            if (await insertBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await insertBtn.click()
              await editorPage.waitForTimeout(800)
              break
            }
          }

          // 삽입 후 패널 잔재 닫기
          await editorPage.keyboard.press('Escape').catch(() => {})
          await editorPage.waitForTimeout(200)

          await editorPage.keyboard.press('Control+End')
          console.log(`[img] ${section.idx + 1}번 이미지 삽입 완료`)
        }
      }

      const bodyText = await getBodyText(editorPage)
      console.log('[body] 입력 후 본문 (앞 80자):', bodyText.slice(0, 80) || '(비어있음)')
      await snap(editorPage, '본문입력후', 5)

      if (!bodyVerified || !bodyText.trim()) {
        throw new Error('본문 입력 실패: 에디터에 텍스트 없음. debug-screenshots 폴더 확인.')
      }
    })

    // ── 7. 위치 지도 삽입 ────────────────────────────────────────────
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

        const searchSel = 'input[placeholder*="장소"],input[placeholder*="검색"],input[type="search"],.se-map-search-input'
        let searchInput = editorCtx.locator(searchSel).first()
        if (!await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          searchInput = editorPage.locator(searchSel).first()
        }
        if (await searchInput.isVisible({ timeout: 4000 }).catch(() => false)) {
          await searchInput.fill(location)
          await searchInput.press('Enter')
          await editorPage.waitForTimeout(2000)

          const resultSel = '.se-map-item,.se-place-item,[class*="map_item"],[class*="place_item"],li[class*="item"]'
          let firstResult = editorCtx.locator(resultSel).first()
          if (!await firstResult.isVisible({ timeout: 2000 }).catch(() => false)) {
            firstResult = editorPage.locator(resultSel).first()
          }
          if (await firstResult.isVisible({ timeout: 4000 }).catch(() => false)) {
            await firstResult.click()
            await editorPage.waitForTimeout(800)
          }

          const confirmSel = 'button:has-text("추가"),button:has-text("확인"),button:has-text("삽입"),button:has-text("완료")'
          let confirmed = false
          for (const ctx of [editorPage.locator(confirmSel).last(), editorCtx.locator(confirmSel).last()]) {
            if (await ctx.isVisible({ timeout: 2000 }).catch(() => false)) {
              await ctx.click(); confirmed = true; break
            }
          }
          if (!confirmed) {
            for (const frame of editorPage.frames()) {
              const btn = frame.locator(confirmSel).last()
              if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
                await btn.click(); confirmed = true; break
              }
            }
          }
          if (!confirmed) await editorPage.keyboard.press('Enter')
          await editorPage.waitForTimeout(1000)
        }
      })
    }

    // ── 8. 발행 전 본문 최종 검증 ────────────────────────────────────
    const prePublishBody = await getBodyText(editorPage)
    if (!prePublishBody.trim()) {
      await snap(editorPage, '발행차단-본문비어있음', stepIndex + 1)
      await browser.close().catch(() => {})
      return { success: false, error: '본문이 비어 있어 발행을 중단했습니다.', lastStep: '발행전검증' }
    }

    // ── 9. 발행 버튼 클릭 ────────────────────────────────────────────
    await step('발행버튼클릭', async () => {
      // 이미지 패널 포함 모든 팝업 닫기 (Escape × 2)
      await editorPage.keyboard.press('Escape').catch(() => {})
      await editorPage.waitForTimeout(300)
      await editorPage.keyboard.press('Escape').catch(() => {})
      await editorPage.waitForTimeout(400)

      // 발행 버튼 선택자 목록 (정확한 클래스명 우선, 넓은 범위 나중)
      const publishSelectors = [
        'button[class*="publish_btn"]',
        'button.publish_btn',
        'button[aria-label="발행"]',
      ]

      let publishBtn: Locator | null = null

      // 최대 10초간 재시도
      const deadline = Date.now() + 10_000
      while (!publishBtn && Date.now() < deadline) {
        for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
          for (const sel of publishSelectors) {
            const btn = ctx.locator(sel).first()
            if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
              publishBtn = btn
              break
            }
          }
          if (publishBtn) break
        }
        // 프레임 직접 순회
        if (!publishBtn) {
          for (const frame of editorPage.frames()) {
            for (const sel of publishSelectors) {
              const btn = frame.locator(sel).first()
              if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                publishBtn = btn
                break
              }
            }
            if (publishBtn) break
          }
        }
        if (!publishBtn) await editorPage.waitForTimeout(500)
      }

      if (!publishBtn) throw new Error('발행 버튼을 찾지 못했습니다.')
      await publishBtn.click()
    })

    // ── 10. 공개 설정 팝업 + 최종 발행 ─────────────────────────────────
    await step('공개설정팝업', async () => {
      // 팝업 텍스트를 여러 컨텍스트에서 탐색 (iframe 안팎 모두)
      const popupTexts = ['공개 설정', '공개설정', '발행 설정', '전체공개']
      let popupFound = false

      const allCtxs: LocatorCtx[] = [editorCtx, editorPage]
      for (const ctx of allCtxs) {
        for (const txt of popupTexts) {
          const el = ctx.locator(`text=${txt}`).first()
          if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
            popupFound = true
            console.log(`  공개 설정 팝업 감지됨 (텍스트: "${txt}")`)
            break
          }
        }
        if (popupFound) break
      }

      // 팝업 없으면 confirm_btn이 바로 보이는지 확인 (이미 열린 상태일 수 있음)
      if (!popupFound) {
        for (const ctx of allCtxs) {
          const confirmVisible = await ctx.locator('button[class*="confirm_btn"]').first()
            .isVisible({ timeout: 2000 }).catch(() => false)
          if (confirmVisible) {
            popupFound = true
            console.log('  confirm_btn 감지 — 팝업 이미 열린 상태')
            break
          }
        }
      }

      if (!popupFound) {
        await snap(editorPage, '공개팝업없음', stepIndex + 1)
        throw new Error('공개 설정 팝업이 나타나지 않았습니다.')
      }

      // 전체공개 선택
      for (const ctx of allCtxs) {
        const radio = ctx.locator('label:has-text("전체공개"),input[type="radio"][value*="PUBLIC"]').first()
        if (await radio.isVisible({ timeout: 1500 }).catch(() => false)) {
          await radio.click().catch(() => {})
          console.log('  전체공개 선택')
          break
        }
      }
    })

    // ── 11. 최종 발행 확인 ───────────────────────────────────────────
    await step('최종발행확인', async () => {
      // confirm_btn 탐색 (editorCtx → editorPage)
      let clicked = false
      for (const ctx of [editorCtx, editorPage] as LocatorCtx[]) {
        const btn = ctx.locator('button[class*="confirm_btn"]').first()
        if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
          await btn.click()
          clicked = true
          break
        }
      }
      if (!clicked) {
        // 좌표 폴백
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

import OpenAI from 'openai'
import type { ResponseInputItem, ResponseComputerToolCall } from 'openai/resources/responses/responses'
import { chromium, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

export interface PublishSuccess { success: true; url?: string }
export interface PublishFailure { success: false; error: string }
export type PublishResult = PublishSuccess | PublishFailure

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const DISPLAY_WIDTH = 1280
const DISPLAY_HEIGHT = 800
const TIMEOUT_MS = 2 * 60 * 1000

type CUAction = NonNullable<ResponseComputerToolCall['action']>

async function takeScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: 'png' })
  return `data:image/png;base64,${buf.toString('base64')}`
}

// OpenAI keypress keys 배열 → Playwright press 문자열
function toPlaywrightKey(keys: string[]): string {
  const map: Record<string, string> = {
    Return: 'Enter', BackSpace: 'Backspace', Delete: 'Delete',
    Escape: 'Escape', Tab: 'Tab', space: 'Space', End: 'End', Home: 'Home',
    Page_Up: 'PageUp', Page_Down: 'PageDown',
    Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight',
    ctrl: 'Control', cmd: 'Meta', alt: 'Alt', shift: 'Shift',
  }
  return keys.map(k => map[k] ?? k).join('+')
}

async function execAction(page: Page, action: CUAction): Promise<void> {
  switch (action.type) {
    case 'screenshot':
      break

    case 'click': {
      const btn = action.button === 'right' ? 'right' : action.button === 'wheel' ? 'middle' : 'left'
      await page.mouse.click(action.x, action.y, { button: btn as 'left' | 'right' | 'middle' })
      await page.waitForTimeout(600)
      break
    }

    case 'double_click':
      await page.mouse.dblclick(action.x, action.y)
      await page.waitForTimeout(600)
      break

    case 'move':
      await page.mouse.move(action.x, action.y)
      await page.waitForTimeout(200)
      break

    case 'drag': {
      const pts = action.path
      if (pts.length < 2) break
      await page.mouse.move(pts[0].x, pts[0].y)
      await page.mouse.down()
      for (const pt of pts.slice(1)) await page.mouse.move(pt.x, pt.y, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      break
    }

    case 'keypress':
      await page.keyboard.press(toPlaywrightKey(action.keys))
      await page.waitForTimeout(300)
      break

    case 'type':
      await page.keyboard.type(action.text, { delay: 15 })
      await page.waitForTimeout(300)
      break

    case 'scroll':
      await page.mouse.move(action.x, action.y)
      await page.mouse.wheel(action.scroll_x * 80, action.scroll_y * 80)
      await page.waitForTimeout(300)
      break

    case 'wait':
      await page.waitForTimeout(1000)
      break

    default:
      console.log(`[cua] 알 수 없는 액션: ${(action as CUAction).type}`)
  }
}

export async function publishToNaverAI(
  title: string,
  content: string,
  imagePaths: string[] = [],
): Promise<PublishResult> {
  const blogId = process.env.NAVER_BLOG_ID

  if (!blogId) return { success: false, error: 'NAVER_BLOG_ID 환경변수 미설정' }
  if (!fs.existsSync(SESSION_PATH)) return { success: false, error: '세션 없음. npm run naver-login 먼저 실행' }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  let editorPage = page

  try {
    // ── 1. 블로그 홈 이동 ────────────────────────────────────────────
    await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // ── 2. 글쓰기 클릭 ───────────────────────────────────────────────
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
      page.click('a[href*="PostWriteForm"], a:has-text("글쓰기"), button:has-text("글쓰기")', { timeout: 10000 }),
    ])
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded')
      editorPage = newPage
      await editorPage.setViewportSize({ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT })
    }
    await editorPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await editorPage.waitForTimeout(2500)

    // ── 3. OpenAI CUA 루프 ───────────────────────────────────────────
    const imageNote = imagePaths.length > 0
      ? `\n업로드할 이미지: ${imagePaths.join(', ')}`
      : ''

    const instructions =
      `당신은 네이버 블로그 글쓰기 자동화 에이전트입니다. 화면을 보고 ` +
      `제목 입력 → 본문 입력 → 발행 순서로 블로그 글을 작성해주세요.\n` +
      `입력할 제목: ${title}\n` +
      `입력할 본문: ${content}` +
      imageNote +
      `\n모든 작업이 완료되어 발행까지 마치면 "발행완료"라고 텍스트로 응답하세요.`

    const initScreenshot = await takeScreenshot(editorPage)

    const tools = [{
      type: 'computer_use_preview' as const,
      display_width: DISPLAY_WIDTH,
      display_height: DISPLAY_HEIGHT,
      environment: 'browser' as const,
    }]

    // 첫 번째 API 호출
    let response = await openai.responses.create({
      model: 'computer-use-preview',
      instructions,
      tools,
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: initScreenshot },
          { type: 'input_text', text: '네이버 블로그 글쓰기 페이지입니다. 작업을 시작해주세요.' },
        ],
      }] as ResponseInputItem[],
      truncation: 'auto',
    })

    const deadline = Date.now() + TIMEOUT_MS

    while (Date.now() < deadline) {
      // 텍스트 응답 확인 (발행완료 체크)
      for (const item of response.output) {
        if (item.type === 'message') {
          const text = item.content.map(c => ('text' in c ? c.text : '')).join('')
          console.log(`[cua] 텍스트 응답: ${text.slice(0, 100)}`)
          if (text.includes('발행완료') || text.includes('발행 완료')) {
            await browser.close()
            return { success: true, url: editorPage.url() }
          }
        }
      }

      // computer_call 항목 처리
      const calls = response.output.filter(
        (item): item is ResponseComputerToolCall => item.type === 'computer_call'
      )

      if (calls.length === 0) {
        console.log('[cua] computer_call 없음, 루프 종료')
        break
      }

      // 액션 실행 후 스크린샷 수집
      const callOutputs: ResponseInputItem[] = []
      for (const call of calls) {
        if (call.action) {
          console.log(`[cua] action=${call.action.type}`, JSON.stringify(call.action).slice(0, 80))
          await execAction(editorPage, call.action)
        }
        const screenshot = await takeScreenshot(editorPage)
        callOutputs.push({
          type: 'computer_call_output',
          call_id: call.call_id,
          output: { type: 'computer_screenshot', image_url: screenshot },
          // 안전 검사 acknowledged
          acknowledged_safety_checks: call.pending_safety_checks.map(c => ({ id: c.id })),
        } as ResponseInputItem)
      }

      // 다음 턴
      response = await openai.responses.create({
        model: 'computer-use-preview',
        previous_response_id: response.id,
        tools,
        input: callOutputs,
        truncation: 'auto',
      })
    }

    if (Date.now() >= deadline) {
      await browser.close().catch(() => {})
      return { success: false, error: '2분 타임아웃: AI가 발행을 완료하지 못했습니다.' }
    }

    const finalUrl = editorPage.url()
    await browser.close()
    return { success: true, url: finalUrl }
  } catch (err) {
    await browser.close().catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

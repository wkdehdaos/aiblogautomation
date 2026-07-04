import OpenAI from 'openai'
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
const DEBUG_DIR = path.resolve(process.cwd(), 'debug-screenshots-ai')

let _debugReady = false
let _debugIdx = 0
async function saveDebug(page: Page, label: string) {
  if (!_debugReady) { fs.mkdirSync(DEBUG_DIR, { recursive: true }); _debugReady = true }
  _debugIdx++
  await page.screenshot({
    path: path.join(DEBUG_DIR, `${String(_debugIdx).padStart(2, '0')}-${label}.png`),
  }).catch(() => {})
}

const COMPUTER_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'computer_action',
    description: '브라우저 화면에서 액션을 딱 하나만 실행합니다.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'double_click', 'type', 'key', 'scroll_down', 'scroll_up', 'done'],
          description: '실행할 액션',
        },
        x: { type: 'number', description: 'click/double_click 액션의 X 픽셀 좌표' },
        y: { type: 'number', description: 'click/double_click 액션의 Y 픽셀 좌표' },
        text: { type: 'string', description: 'type 액션의 입력 텍스트, key 액션의 키 이름' },
        reason: { type: 'string', description: '이 액션을 하는 이유' },
      },
      required: ['action', 'reason'],
    },
  },
}

async function takeScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: 'png' })
  return buf.toString('base64')
}

async function execAction(page: Page, args: Record<string, unknown>): Promise<void> {
  const action = args.action as string
  const x = args.x as number | undefined
  const y = args.y as number | undefined
  const text = args.text as string | undefined

  switch (action) {
    case 'click':
      if (x !== undefined && y !== undefined) {
        await page.mouse.click(x, y)
        await page.waitForTimeout(700)
      }
      break
    case 'double_click':
      if (x !== undefined && y !== undefined) {
        await page.mouse.dblclick(x, y)
        await page.waitForTimeout(700)
      }
      break
    case 'type':
      if (text) {
        await page.keyboard.type(text, { delay: 15 })
        await page.waitForTimeout(500)
      }
      break
    case 'key': {
      const keyMap: Record<string, string> = {
        Enter: 'Enter', Return: 'Enter', Tab: 'Tab',
        Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete',
        End: 'End', Home: 'Home',
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
      }
      await page.keyboard.press(keyMap[text ?? 'Enter'] ?? (text ?? 'Enter'))
      await page.waitForTimeout(400)
      break
    }
    case 'scroll_down':
      await page.mouse.move(x ?? DISPLAY_WIDTH / 2, y ?? DISPLAY_HEIGHT / 2)
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(300)
      break
    case 'scroll_up':
      await page.mouse.move(x ?? DISPLAY_WIDTH / 2, y ?? DISPLAY_HEIGHT / 2)
      await page.mouse.wheel(0, -400)
      await page.waitForTimeout(300)
      break
    case 'done':
      break
    default:
      console.log(`[cua] 알 수 없는 액션: ${action}`)
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

  // 디버그 폴더 초기화
  _debugReady = false; _debugIdx = 0
  if (fs.existsSync(DEBUG_DIR)) fs.rmSync(DEBUG_DIR, { recursive: true })

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
    // ── 1. 블로그 홈 이동 ──────────────────────────────────────────
    await page.goto(`https://blog.naver.com/${blogId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // ── 2. 글쓰기 클릭 ─────────────────────────────────────────────
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

    await saveDebug(editorPage, 'editor-loaded')

    // ── 3. GPT-4o Vision + Tool Calling 루프 ───────────────────────
    const imageNote = imagePaths.length > 0 ? `\n업로드할 이미지: ${imagePaths.join(', ')}` : ''

    const systemPrompt =
      `당신은 네이버 블로그 글쓰기 자동화 에이전트입니다.\n` +
      `뷰포트: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}px\n\n` +
      `⚠️ 규칙: 매 응답마다 반드시 computer_action 도구를 정확히 1번만 호출하세요.\n` +
      `스크린샷을 보고 현재 상태를 파악한 뒤, 다음에 해야 할 액션 하나만 실행하세요.\n` +
      `액션 후 다음 스크린샷을 보고 결과를 확인하며 진행하세요.\n\n` +
      `작업 순서:\n` +
      `1. 제목 입력 영역(상단 "제목" 플레이스홀더)을 클릭\n` +
      `2. 제목 타이핑\n` +
      `3. 본문 편집 영역 클릭\n` +
      `4. 본문 타이핑\n` +
      `5. 우상단 "발행" 버튼 클릭\n` +
      `6. 팝업에서 전체공개 확인 후 발행 버튼 클릭\n` +
      `7. 발행 완료 확인 후 done 호출\n\n` +
      `입력할 제목: ${title}\n` +
      `입력할 본문: ${content}` +
      imageNote

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // 초기 스크린샷
    const initShot = await takeScreenshot(editorPage)
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${initShot}`, detail: 'high' } },
        { type: 'text', text: '네이버 블로그 글쓰기 페이지입니다. 첫 번째 액션을 실행해주세요.' },
      ],
    })

    const deadline = Date.now() + TIMEOUT_MS

    while (Date.now() < deadline) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: [COMPUTER_TOOL],
        tool_choice: { type: 'function', function: { name: 'computer_action' } },
        max_tokens: 512,
      })

      const msg = completion.choices[0].message
      messages.push(msg)

      const toolCalls = (msg.tool_calls ?? []).filter(c => c.type === 'function')
      if (toolCalls.length === 0) { console.log('[cua] tool_calls 없음'); break }

      // 첫 번째 tool call만 처리 (1개 강제)
      const call = toolCalls[0]
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>
      console.log(`[cua] action=${args.action} x=${args.x ?? '-'} y=${args.y ?? '-'} | ${args.reason}`)

      // tool_result 먼저 push (OpenAI 요구사항)
      messages.push({ role: 'tool', tool_call_id: call.id, content: '액션 완료' })

      if (args.action === 'done') {
        // 발행 후 네비게이션 대기
        await editorPage.waitForTimeout(3000)
        await saveDebug(editorPage, 'done')
        const finalUrl = editorPage.url()
        await browser.close()
        if (finalUrl.includes('Redirect=Write') || finalUrl.includes('PostWriteForm')) {
          return { success: false, error: '발행이 완료되지 않았습니다. 글쓰기 페이지에 머물러 있습니다.' }
        }
        return { success: true, url: finalUrl }
      }

      await execAction(editorPage, args)
      await saveDebug(editorPage, `${_debugIdx}-${args.action}`)

      // 액션 후 스크린샷을 다음 user 메시지로
      const screenshot = await takeScreenshot(editorPage)
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'high' } },
          { type: 'text', text: '현재 화면입니다. 다음 액션 하나를 실행해주세요.' },
        ],
      })
    }

    if (Date.now() >= deadline) {
      await browser.close().catch(() => {})
      return { success: false, error: '2분 타임아웃' }
    }

    await browser.close()
    return { success: false, error: 'AI가 done을 호출하지 않고 루프를 종료했습니다.' }
  } catch (err) {
    await browser.close().catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

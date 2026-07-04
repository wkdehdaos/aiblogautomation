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

// GPT-4o에게 줄 액션 툴 스키마
const COMPUTER_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'computer_action',
    description: '브라우저 화면에서 마우스·키보드 액션을 실행합니다.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'double_click', 'right_click', 'type', 'key', 'scroll_down', 'scroll_up', 'done'],
          description: '실행할 액션 종류',
        },
        x: { type: 'number', description: '클릭할 X 픽셀 좌표 (뷰포트 기준)' },
        y: { type: 'number', description: '클릭할 Y 픽셀 좌표 (뷰포트 기준)' },
        text: { type: 'string', description: 'type 액션일 때 입력할 텍스트, key 액션일 때 키 이름 (Enter, Tab, Escape 등)' },
        reason: { type: 'string', description: '이 액션을 하는 이유 (디버그용)' },
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

    case 'right_click':
      if (x !== undefined && y !== undefined) {
        await page.mouse.click(x, y, { button: 'right' })
        await page.waitForTimeout(500)
      }
      break

    case 'type':
      if (text) {
        await page.keyboard.type(text, { delay: 15 })
        await page.waitForTimeout(400)
      }
      break

    case 'key': {
      const keyMap: Record<string, string> = {
        Enter: 'Enter', Return: 'Enter', Tab: 'Tab',
        Escape: 'Escape', Backspace: 'Backspace', Delete: 'Delete',
        End: 'End', Home: 'Home', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
      }
      const key = text ?? 'Enter'
      await page.keyboard.press(keyMap[key] ?? key)
      await page.waitForTimeout(400)
      break
    }

    case 'scroll_down':
      if (x !== undefined && y !== undefined) {
        await page.mouse.move(x, y)
        await page.mouse.wheel(0, 300)
      } else {
        await page.mouse.wheel(0, 300)
      }
      await page.waitForTimeout(300)
      break

    case 'scroll_up':
      if (x !== undefined && y !== undefined) {
        await page.mouse.move(x, y)
        await page.mouse.wheel(0, -300)
      } else {
        await page.mouse.wheel(0, -300)
      }
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

    // ── 3. GPT-4o Vision + Tool Calling 루프 ───────────────────────
    const imageNote = imagePaths.length > 0
      ? `\n업로드할 이미지: ${imagePaths.join(', ')}`
      : ''

    const systemPrompt =
      `당신은 네이버 블로그 글쓰기 자동화 에이전트입니다.\n` +
      `뷰포트 크기: ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}px\n` +
      `화면 스크린샷을 보고 computer_action 도구를 사용하여 다음 순서로 작업하세요:\n` +
      `1. 제목 입력 영역 클릭 후 제목 입력\n` +
      `2. 본문 입력 영역 클릭 후 본문 입력\n` +
      `3. 발행 버튼 클릭\n` +
      `4. 공개 설정 팝업에서 전체공개 확인 후 발행 완료\n\n` +
      `입력할 제목: ${title}\n` +
      `입력할 본문: ${content}` +
      imageNote +
      `\n\n모든 발행이 완료되면 action: "done"을 호출하세요.`

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ]

    // 초기 스크린샷
    const initShot = await takeScreenshot(editorPage)
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${initShot}`, detail: 'high' } },
        { type: 'text', text: '네이버 블로그 글쓰기 페이지입니다. 작업을 시작해주세요.' },
      ],
    })

    const deadline = Date.now() + TIMEOUT_MS

    while (Date.now() < deadline) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: [COMPUTER_TOOL],
        tool_choice: 'required',
        max_tokens: 1024,
      })

      const msg = completion.choices[0].message
      messages.push(msg)

      const toolCalls = msg.tool_calls ?? []
      if (toolCalls.length === 0) {
        console.log('[cua] tool_calls 없음, 루프 종료')
        break
      }

      let isDone = false
      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = []

      for (const call of toolCalls) {
        if (call.type !== 'function') continue
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>
        console.log(`[cua] action=${args.action} x=${args.x} y=${args.y} | ${args.reason}`)

        if (args.action === 'done') {
          isDone = true
          toolResults.push({ role: 'tool', tool_call_id: call.id, content: '발행 완료 확인됨' })
          break
        }

        await execAction(editorPage, args)
        const screenshot = await takeScreenshot(editorPage)

        toolResults.push({ role: 'tool', tool_call_id: call.id, content: '액션 완료' })

        // 스크린샷을 다음 user 메시지로 전달
        messages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'high' } },
            { type: 'text', text: '액션 실행 후 현재 화면입니다. 다음 액션을 결정해주세요.' },
          ],
        })
      }

      // tool result를 tool_calls 바로 뒤에 삽입 (OpenAI 요구사항)
      if (toolResults.length > 0) {
        messages.splice(messages.length - 1, 0, ...toolResults)
      }

      if (isDone) {
        await browser.close()
        return { success: true, url: editorPage.url() }
      }
    }

    if (Date.now() >= deadline) {
      await browser.close().catch(() => {})
      return { success: false, error: '2분 타임아웃: AI가 발행을 완료하지 못했습니다.' }
    }

    await browser.close()
    return { success: true, url: editorPage.url() }
  } catch (err) {
    await browser.close().catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam, BetaToolResultBlockParam, BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
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

const KEY_MAP: Record<string, string> = {
  Return: 'Enter',
  BackSpace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  Tab: 'Tab',
  space: 'Space',
  'ctrl+a': 'Control+a',
  'ctrl+c': 'Control+c',
  'ctrl+v': 'Control+v',
  'ctrl+z': 'Control+z',
  End: 'End',
  Home: 'Home',
  'Page_Up': 'PageUp',
  'Page_Down': 'PageDown',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
}

async function takeScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: 'png' })
  return buf.toString('base64')
}

async function execAction(page: Page, input: Record<string, unknown>): Promise<void> {
  const action = input.action as string

  switch (action) {
    case 'screenshot':
      break

    case 'left_click': {
      const [x, y] = input.coordinate as [number, number]
      await page.mouse.click(x, y)
      await page.waitForTimeout(600)
      break
    }

    case 'double_click': {
      const [x, y] = input.coordinate as [number, number]
      await page.mouse.dblclick(x, y)
      await page.waitForTimeout(600)
      break
    }

    case 'right_click': {
      const [x, y] = input.coordinate as [number, number]
      await page.mouse.click(x, y, { button: 'right' })
      await page.waitForTimeout(400)
      break
    }

    case 'middle_click': {
      const [x, y] = input.coordinate as [number, number]
      await page.mouse.click(x, y, { button: 'middle' })
      await page.waitForTimeout(400)
      break
    }

    case 'mouse_move': {
      const [x, y] = input.coordinate as [number, number]
      await page.mouse.move(x, y)
      await page.waitForTimeout(200)
      break
    }

    case 'left_click_drag': {
      const [startX, startY] = input.start_coordinate as [number, number]
      const [endX, endY] = input.coordinate as [number, number]
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(endX, endY, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      break
    }

    case 'type': {
      const text = input.text as string
      await page.keyboard.type(text, { delay: 15 })
      await page.waitForTimeout(300)
      break
    }

    case 'key': {
      const rawKey = input.text as string
      const keys = rawKey.split('+')
      if (keys.length > 1) {
        // modifier+key 조합
        const modifiers = keys.slice(0, -1).map(k =>
          k === 'ctrl' ? 'Control' : k === 'cmd' ? 'Meta' : k.charAt(0).toUpperCase() + k.slice(1)
        )
        const mainKey = keys[keys.length - 1]
        const combo = [...modifiers, mainKey].join('+')
        await page.keyboard.press(KEY_MAP[rawKey] ?? combo)
      } else {
        await page.keyboard.press(KEY_MAP[rawKey] ?? rawKey)
      }
      await page.waitForTimeout(300)
      break
    }

    case 'scroll': {
      const [x, y] = input.coordinate as [number, number]
      const direction = input.direction as string
      const amount = (input.amount as number) ?? 3
      const deltaX = direction === 'left' ? -120 * amount : direction === 'right' ? 120 * amount : 0
      const deltaY = direction === 'up' ? -120 * amount : direction === 'down' ? 120 * amount : 0
      await page.mouse.move(x, y)
      await page.mouse.wheel(deltaX, deltaY)
      await page.waitForTimeout(300)
      break
    }

    case 'cursor_position':
      break

    default:
      console.log(`[computer-use] 알 수 없는 액션: ${action}`)
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

  const client = new Anthropic()

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

    // ── 2. 글쓰기 클릭 → 에디터 페이지 ─────────────────────────────
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

    // ── 3. Computer Use 루프 ─────────────────────────────────────────
    const imageNote = imagePaths.length > 0
      ? `\n업로드할 이미지 파일 경로: ${imagePaths.join(', ')}\n이미지는 에디터 툴바의 사진/이미지 버튼을 통해 업로드하거나, 본문 입력 완료 후 진행하세요.`
      : '\n이미지는 없습니다.'

    const systemPrompt =
      `당신은 네이버 블로그 글쓰기 자동화 에이전트입니다. 화면을 보고 제목 입력 → 본문 입력 → 발행 순서로 블로그 글을 작성해주세요.\n` +
      `입력할 제목: ${title}\n` +
      `입력할 본문: ${content}` +
      imageNote +
      `\n각 단계가 완료되면 다음 단계로 넘어가세요.\n` +
      `모든 작업(발행 포함)이 완전히 완료되었을 때만 "발행완료"라고 텍스트로 응답하세요.`

    const messages: BetaMessageParam[] = []

    // 초기 스크린샷을 첫 user 메시지에 포함
    const initScreenshot = await takeScreenshot(editorPage)
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: initScreenshot },
        } as BetaContentBlockParam,
        {
          type: 'text',
          text: '네이버 블로그 글쓰기 페이지입니다. 지시에 따라 작업을 시작해주세요.',
        } as BetaContentBlockParam,
      ],
    })

    const deadline = Date.now() + TIMEOUT_MS

    while (Date.now() < deadline) {
      const response = await client.beta.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 4096,
        system: systemPrompt,
        tools: [
          {
            type: 'computer_20250124',
            name: 'computer',
            display_width_px: DISPLAY_WIDTH,
            display_height_px: DISPLAY_HEIGHT,
          },
        ],
        messages,
        betas: ['computer-use-2025-01-24'],
      })

      // 어시스턴트 응답을 메시지 히스토리에 추가
      messages.push({ role: 'assistant', content: response.content })

      // 텍스트 응답 확인 → 발행완료 체크
      const textBlocks = response.content.filter(b => b.type === 'text')
      const isDone = textBlocks.some(
        b => b.type === 'text' && (b.text.includes('발행완료') || b.text.includes('발행 완료'))
      )
      if (isDone) {
        console.log('[computer-use] 발행완료 확인')
        break
      }

      // 도구 사용 없이 종료된 경우
      if (response.stop_reason !== 'tool_use') {
        console.log(`[computer-use] stop_reason=${response.stop_reason}, 루프 종료`)
        break
      }

      // 도구 액션 실행 후 결과(스크린샷) 반환
      const toolResults: BetaToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        const input = block.input as Record<string, unknown>
        console.log(`[computer-use] action=${input.action}`, input.coordinate ?? input.text ?? '')

        await execAction(editorPage, input)

        const screenshot = await takeScreenshot(editorPage)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshot },
            },
          ],
        })
      }

      messages.push({ role: 'user', content: toolResults })
    }

    if (Date.now() >= deadline) {
      await browser.close().catch(() => {})
      return { success: false, error: '5분 타임아웃: AI가 발행을 완료하지 못했습니다.' }
    }

    const finalUrl = editorPage.url()
    await browser.close()
    return { success: true, url: finalUrl }
  } catch (err) {
    await browser.close().catch(() => {})
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

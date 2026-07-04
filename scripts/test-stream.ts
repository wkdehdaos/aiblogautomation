import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

// .env.local 수동 파싱
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  })
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BLOG_TOOL: Anthropic.Tool = {
  name: 'write_blog_post',
  description: '블로그 글 제목과 HTML 본문을 작성합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['title', 'content'],
  },
}

async function main() {
  console.log('스트리밍 시작...')
  const eventCounts: Record<string, number> = {}

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: '짧은 블로그 글을 작성하세요.',
    tools: [BLOG_TOOL],
    tool_choice: { type: 'tool', name: 'write_blog_post' },
    messages: [{ role: 'user', content: '테스트 카페에 대한 블로그 글' }],
  })

  stream.on('streamEvent', (event) => {
    const key = event.type + (('delta' in event && event.delta) ? ':' + (event.delta as {type?:string}).type : '')
    eventCounts[key] = (eventCounts[key] || 0) + 1

    if (event.type === 'content_block_delta') {
      const d = event.delta as {type?: string; partial_json?: string}
      if (d.type === 'input_json_delta' && d.partial_json) {
        process.stdout.write(d.partial_json)
      }
    }
  })

  const msg = await stream.finalMessage()
  console.log('\n\n=== 이벤트 통계 ===')
  console.log(JSON.stringify(eventCounts, null, 2))
  console.log('=== 최종 메시지 ===')
  console.log('stop_reason:', msg.stop_reason)
  console.log('content blocks:', msg.content.length)
  msg.content.forEach((b, i) => {
    if (b.type === 'tool_use') {
      console.log(`[${i}] tool_use: ${b.name}`)
      const input = b.input as {title?: string; content?: string}
      console.log('  title:', input.title?.slice(0, 50))
      console.log('  content length:', input.content?.length)
    }
  })
}

main().catch(console.error)

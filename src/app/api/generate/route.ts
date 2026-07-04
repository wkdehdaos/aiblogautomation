import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

const LENGTH_MAP: Record<string, string> = {
  short: '500자 이내',
  medium: '1000자 내외',
  long: '2000자 내외',
}

const TONE_MAP: Record<string, string> = {
  friendly: '친근하고 편안한 말투',
  professional: '전문적이고 신뢰감 있는 말투',
  informative: '정보 전달 중심의 명확한 말투',
}

const MAX_TOKENS_MAP: Record<string, number> = {
  short: 1500,
  medium: 2500,
  long: 4096,
}

async function toImageBlock(file: File): Promise<Anthropic.ImageBlockParam | null> {
  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer() as ArrayBuffer)
    const finalBuffer = await sharp(rawBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer()
    return {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: finalBuffer.toString('base64') },
    }
  } catch {
    return null
  }
}

const BLOG_TOOL: Anthropic.Tool = {
  name: 'write_blog_post',
  description: '블로그 글 제목과 HTML 본문을 작성합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: '블로그 글 제목 (이모지·HTML 태그 없는 순수 텍스트)' },
      content: { type: 'string', description: '블로그 본문 HTML' },
    },
    required: ['title', 'content'],
  },
}

// tool input JSON에서 content 값을 실시간으로 추출하는 클래스
// 주의: Claude 스트리밍은 "content": "value" (공백 포함) 형태로 올 수 있음
class ContentExtractor {
  private buf = ''
  private state: 'searching' | 'streaming' | 'done' = 'searching'
  private escape = false
  private unicodeSeq = ''

  // "content" 키 이후의 첫 " 위치를 찾아 content 값 시작 인덱스 반환 (-1이면 미발견)
  private findContentStart(s: string): number {
    const keyIdx = s.indexOf('"content"')
    if (keyIdx === -1) return -1
    // "content" 이후에 : 와 " 를 찾음 (사이에 공백 허용)
    let i = keyIdx + '"content"'.length
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++
    if (i >= s.length || s[i] !== ':') return -1
    i++ // skip ':'
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++
    if (i >= s.length || s[i] !== '"') return -1
    return i + 1 // content 값의 첫 문자 위치
  }

  process(delta: string): { title?: string; content?: string; done?: boolean } {
    if (this.state === 'done') return {}

    if (this.state === 'searching') {
      this.buf += delta
      const contentStart = this.findContentStart(this.buf)
      if (contentStart === -1) return {}

      // title 추출 (공백 포함 형식 모두 지원)
      let title: string | undefined
      const titleMatch = this.buf.slice(0, contentStart).match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      if (titleMatch) {
        try { title = JSON.parse(`"${titleMatch[1]}"`) } catch { /* ignore */ }
      }

      this.state = 'streaming'
      const rest = this.buf.slice(contentStart)
      this.buf = ''
      const { content, done } = this.streamChunk(rest)
      return { title, content, done }
    }

    // state === 'streaming'
    return this.streamChunk(delta)
  }

  private streamChunk(text: string): { content?: string; done?: boolean } {
    let out = ''
    let i = 0

    // 이전 청크에서 이어진 유니코드 시퀀스 처리
    if (this.unicodeSeq.length > 0) {
      const need = 4 - this.unicodeSeq.length
      const take = Math.min(need, text.length)
      this.unicodeSeq += text.slice(0, take)
      i = take
      if (this.unicodeSeq.length === 4) {
        out += String.fromCharCode(parseInt(this.unicodeSeq, 16))
        this.unicodeSeq = ''
      }
    }

    while (i < text.length) {
      const ch = text[i]
      if (this.escape) {
        this.escape = false
        switch (ch) {
          case '"': out += '"'; break
          case '\\': out += '\\'; break
          case '/': out += '/'; break
          case 'n': out += '\n'; break
          case 'r': out += '\r'; break
          case 't': out += '\t'; break
          case 'b': out += '\b'; break
          case 'f': out += '\f'; break
          case 'u': {
            const hex = text.slice(i + 1, i + 5)
            if (hex.length === 4) {
              out += String.fromCharCode(parseInt(hex, 16))
              i += 4
            } else {
              this.unicodeSeq = hex
              i = text.length // 다음 청크에서 처리
            }
            break
          }
          default: out += ch
        }
      } else if (ch === '\\') {
        this.escape = true
      } else if (ch === '"') {
        this.state = 'done'
        return { content: out || undefined, done: true }
      } else {
        out += ch
      }
      i++
    }

    return { content: out || undefined }
  }
}

function sseEvent(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`)
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const formData = await req.formData()
  const businessName = formData.get('businessName') as string
  const businessInfo = formData.get('businessInfo') as string
  const keywordsRaw = (formData.get('keywords') as string) || '[]'
  const keywords: string[] = JSON.parse(keywordsRaw)
  const lengthOption = (formData.get('lengthOption') as string) || 'medium'
  const customLength = formData.get('customLength') as string
  const tone = (formData.get('tone') as string) || 'friendly'
  const seoOptimize = formData.get('seoOptimize') === 'true'
  const mustInclude = (formData.get('mustInclude') as string) || ''
  const mustExclude = (formData.get('mustExclude') as string) || ''
  const titleHint = (formData.get('title') as string) || ''
  const photoFiles = formData.getAll('photos') as File[]

  const results = await Promise.allSettled(photoFiles.map(toImageBlock))
  const successIndices: number[] = []
  const imageBlocks: Anthropic.ImageBlockParam[] = []
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && r.value !== null) {
      imageBlocks.push(r.value)
      successIndices.push(idx)
    }
  })

  const lengthInstruction =
    lengthOption === 'custom' && customLength
      ? `${customLength}자 내외`
      : (LENGTH_MAP[lengthOption] ?? '1000자 내외')

  const toneInstruction = TONE_MAP[tone] ?? '친근하고 편안한 말투'
  const maxTokens = MAX_TOKENS_MAP[lengthOption] ?? 2500

  const systemPrompt = `당신은 10년 경력의 한국 파워블로거입니다. write_blog_post 툴을 반드시 호출해 title과 content를 채워주세요.

## 글쓰기 스타일
- 1인칭 시점, 친한 친구에게 말하듯 자연스럽고 솔직하게 — 문장이 딱딱하지 않고 흐르듯 이어져야 함
- 구체적인 디테일 (맛, 식감, 분위기, 직원 태도, 대기 시간, 가격 체감 등) 을 생생하게 묘사
- 단점이나 아쉬운 점도 한두 가지 솔직하게 언급 — 그래야 진짜 후기처럼 보임
- "강추", "필수코스", "강력 추천", "맛집 인정" 같은 광고성·과장 표현 절대 금지
- 이모지는 맨 앞 인사 👋 딱 하나만 — 본문에는 절대 사용 금지
- 문단과 문단 사이 흐름이 자연스럽게 이어지도록
- 숫자 접두어(1. 2. 3.) 부제목 사용 금지

## content 필드 HTML 구조 (반드시 준수)

<p style="font-size:28px;text-align:center;margin:0 0 16px">👋</p>

<p style="line-height:1.9;font-size:15px;color:#333">도입 내용...</p>

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<!--IMAGE_1-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<div style="text-align:center;margin:28px 0;padding:20px">
  <p style="font-size:13px;color:#aaa;margin:0">"</p>
  <p style="font-size:16px;font-weight:600;color:#333;margin:8px 0;line-height:1.7">핵심 인상이나 느낌을 한 문장으로</p>
  <p style="font-size:13px;color:#aaa;margin:0">"</p>
</div>

<!--IMAGE_2-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">방문 정보</h2>
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444;line-height:2.2">
    <li><strong>영업시간</strong> &nbsp; ...</li>
    <li><strong>가격대</strong> &nbsp; ...</li>
    <li><strong>주차</strong> &nbsp; ...</li>
    <li><strong>예약</strong> &nbsp; ...</li>
  </ul>
</div>

## title 필드 스타일
- 업체명 + 솔직한 느낌/특징을 담은 자연스러운 문장
- 예: "[업체명] 다녀온 솔직 후기, 기대보다 괜찮았던 이유"
- 이모지·HTML 태그 없이`

  const userLines = [
    `업체명: ${businessName}`,
    `업체 정보:\n${businessInfo}`,
    keywords.length > 0 && `키워드: ${keywords.join(', ')}`,
    `글 길이: ${lengthInstruction}`,
    `말투: ${toneInstruction}`,
    seoOptimize && 'SEO 최적화: 주요 키워드를 제목과 본문에 자연스럽게 반복 활용해 주세요.',
    mustInclude && `반드시 포함할 내용: ${mustInclude}`,
    mustExclude && `반드시 제외할 내용: ${mustExclude}`,
    titleHint && `제목 힌트 (참고용): ${titleHint}`,
    imageBlocks.length > 0 &&
      `첨부 사진 ${imageBlocks.length}장이 있습니다. content 본문 중간 적절한 위치마다 <!--IMAGE_1-->, <!--IMAGE_2--> ... <!--IMAGE_${imageBlocks.length}--> 마커를 삽입해 주세요.`,
  ]
    .filter(Boolean)
    .join('\n')

  const userContent: Anthropic.MessageParam['content'] = [
    { type: 'text', text: userLines },
    ...imageBlocks,
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: object) => controller.enqueue(sseEvent(obj))

      try {
        const extractor = new ContentExtractor()
        let titleFlushed = false
        let doneFlushed = false

        const anthropicStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: maxTokens,
          system: systemPrompt,
          tools: [BLOG_TOOL],
          tool_choice: { type: 'tool', name: 'write_blog_post' },
          messages: [{ role: 'user', content: userContent }],
        })

        anthropicStream.on('streamEvent', (event) => {
          if (event.type !== 'content_block_delta') return
          const delta = event.delta as {type?: string; partial_json?: string}
          if (delta.type !== 'input_json_delta') return

          const { title, content, done } = extractor.process(delta.partial_json ?? '')

          if (title && !titleFlushed) {
            enqueue({ t: 'title', v: title })
            titleFlushed = true
          }
          if (content) enqueue({ t: 'chunk', v: content })
          if (done && !doneFlushed) {
            enqueue({ t: 'done', v: successIndices })
            doneFlushed = true
          }
        })

        await anthropicStream.finalMessage()

        // extractor에서 done이 안 왔을 경우 보장 (max_tokens 등)
        if (!doneFlushed) enqueue({ t: 'done', v: successIndices })
      } catch (err) {
        enqueue({ t: 'error', v: err instanceof Error ? err.message : '오류 발생' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx/proxy 버퍼링 비활성화
    },
  })
}

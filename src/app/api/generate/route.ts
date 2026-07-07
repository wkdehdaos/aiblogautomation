import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPostLimit, isNewMonth } from '@/lib/plans'

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

// tool_use로 구조화된 출력을 강제 — title/content 필드가 스키마로 보장됨
const BLOG_TOOL: Anthropic.Tool = {
  name: 'write_blog_post',
  description: '블로그 글 제목과 HTML 본문을 작성합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: '블로그 글 제목 (이모지·HTML 태그 없는 순수 텍스트)',
      },
      content: {
        type: 'string',
        description: '블로그 본문 HTML',
      },
    },
    required: ['title', 'content'],
  },
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
  }

  // 플랜별 생성 횟수 체크
  let user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  if (isNewMonth(user.postCountResetAt)) {
    user = await prisma.user.update({
      where: { id: session.userId },
      data: { postCount: 0, postCountResetAt: new Date() },
    })
  }

  const limit = getPostLimit(user.plan)
  if (user.postCount >= limit) {
    return Response.json(
      { error: `이번 달 생성 한도(${limit}회)를 초과했습니다. 플랜을 업그레이드해주세요.`, limitExceeded: true },
      { status: 429 }
    )
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
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

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [BLOG_TOOL],
      tool_choice: { type: 'tool', name: 'write_blog_post' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (!toolUse) {
      console.error('[generate] tool_use 블록 없음:', JSON.stringify(response.content).slice(0, 300))
      return Response.json({ error: '응답 파싱 실패' }, { status: 500 })
    }

    const { title, content } = toolUse.input as { title: string; content: string }

    await prisma.user.update({
      where: { id: session.userId },
      data: { postCount: { increment: 1 } },
    })

    return Response.json({ title, content, successIndices })
  } catch (err) {
    console.error('[generate] error:', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return Response.json({ error: message }, { status: 500 })
  }
}

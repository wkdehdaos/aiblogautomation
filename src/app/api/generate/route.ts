import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

const VALID_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
  }

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

  const imageBlocks: Anthropic.ImageBlockParam[] = (
    await Promise.all(
      photoFiles.map(async (file) => {
        const mediaType = VALID_IMAGE_TYPES.has(file.type)
          ? (file.type as Anthropic.Base64ImageSource['media_type'])
          : ('image/jpeg' as const)
        const buffer = await file.arrayBuffer()
        const data = Buffer.from(buffer).toString('base64')
        return {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: mediaType, data },
        }
      })
    )
  )

  const lengthInstruction =
    lengthOption === 'custom' && customLength
      ? `${customLength}자 내외`
      : (LENGTH_MAP[lengthOption] ?? '1000자 내외')

  const toneInstruction = TONE_MAP[tone] ?? '친근하고 편안한 말투'

  const systemPrompt = `당신은 10년차 파워블로거입니다. 실제로 업체를 방문하고 직접 경험한 것처럼 자연스러운 블로그 글을 작성합니다.

작성 원칙:
- 실제 방문한 것처럼 1인칭 시점으로 작성
- 광고성 표현 최소화 (과도한 칭찬, "강추", "필수코스", "강력 추천" 등 자제)
- 솔직하고 균형 잡힌 시각 유지
- HTML 태그 사용 (h2, h3, p, ul, li, strong 등)
- 응답은 반드시 유효한 JSON 한 개만 출력하고 다른 텍스트는 포함하지 않음

응답 형식:
{"title":"블로그 글 제목","content":"HTML 형식의 본문"}`

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
    photoFiles.length > 0 &&
      `첨부 사진 ${photoFiles.length}장이 있습니다. 본문 중간 적절한 위치마다 <!--IMAGE_1-->, <!--IMAGE_2--> ... <!--IMAGE_${photoFiles.length}--> 마커를 삽입해 주세요.`,
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
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return Response.json({ error: '응답 파싱 실패' }, { status: 500 })
  }

  const { title, content } = JSON.parse(jsonMatch[0]) as { title: string; content: string }
  return Response.json({ title, content })
}

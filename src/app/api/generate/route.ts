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

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
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

    // 사진 변환 실패해도 전체 요청은 계속 진행
    const results = await Promise.allSettled(photoFiles.map(toImageBlock))
    // 성공한 사진의 원본 인덱스를 추적해 클라이언트가 올바른 사진을 매핑할 수 있게 함
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

    const systemPrompt = `당신은 10년 경력의 한국 파워블로거입니다. 이모지는 절대 사용하지 않습니다. 아래 HTML 구조와 스타일을 정확히 따라 작성하세요.

## 글쓰기 스타일
- 1인칭 시점, 친한 친구에게 말하듯 자연스럽고 솔직하게 — 문장이 딱딱하지 않고 흐르듯 이어져야 함
- 구체적인 디테일 (맛, 식감, 분위기, 직원 태도, 대기 시간, 가격 체감 등) 을 생생하게 묘사
- 단점이나 아쉬운 점도 한두 가지 솔직하게 언급 — 그래야 진짜 후기처럼 보임
- "강추", "필수코스", "강력 추천", "맛집 인정" 같은 광고성·과장 표현 절대 금지
- 이모지 절대 사용 금지
- 문단과 문단 사이 흐름이 자연스럽게 이어지도록 — 갑작스럽게 섹션이 끊기지 않게
- 숫자 접두어(1. 2. 3.) 부제목 사용 금지

## HTML 구조 (이 순서와 태그를 반드시 지킬 것)

<!-- 1. 도입 문단: 방문 계기, 날씨·동행·기분 등 감성적 상황 묘사로 시작 -->
<p style="line-height:1.9;font-size:15px;color:#333">도입 내용...</p>

<!-- 2. 섹션들: h2로 부제목, 바로 아래 p로 본문. 섹션 수는 글 길이에 맞게 자유롭게. -->
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<!--IMAGE_1-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<!-- 인용구 강조: 핵심 한 문장, 중간에 1회만 -->
<div style="text-align:center;margin:28px 0;padding:20px">
  <p style="font-size:13px;color:#aaa;margin:0">&ldquo;</p>
  <p style="font-size:16px;font-weight:600;color:#333;margin:8px 0;line-height:1.7">핵심 인상이나 느낌을 한 문장으로</p>
  <p style="font-size:13px;color:#aaa;margin:0">&rdquo;</p>
</div>

<!--IMAGE_2-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>

<!-- 마지막: 방문 정보 박스 -->
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">방문 정보</h2>
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444;line-height:2.2">
    <li><strong>영업시간</strong> &nbsp; ...</li>
    <li><strong>가격대</strong> &nbsp; ...</li>
    <li><strong>주차</strong> &nbsp; ...</li>
    <li><strong>예약</strong> &nbsp; ...</li>
  </ul>
</div>

## 제목 스타일
- 업체명 + 솔직한 느낌/특징을 담은 자연스러운 문장
- 예: "[업체명] 다녀온 솔직 후기, 기대보다 괜찮았던 이유", "[업체명] 웨이팅 감수하고 갔는데"
- 이모지 없이

## 응답 규칙
- 반드시 유효한 JSON 한 개만 출력, 다른 텍스트 없음

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
      imageBlocks.length > 0 &&
        `첨부 사진 ${imageBlocks.length}장이 있습니다. 본문 중간 적절한 위치마다 <!--IMAGE_1-->, <!--IMAGE_2--> ... <!--IMAGE_${imageBlocks.length}--> 마커를 삽입해 주세요.`,
    ]
      .filter(Boolean)
      .join('\n')

    const userContent: Anthropic.MessageParam['content'] = [
      { type: 'text', text: userLines },
      ...imageBlocks,
    ]

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    const response = await stream.finalMessage()

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ error: '응답 파싱 실패' }, { status: 500 })
    }

    const { title, content } = JSON.parse(jsonMatch[0]) as { title: string; content: string }
    return Response.json({ title, content, successIndices })
  } catch (err) {
    console.error('[generate] error:', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return Response.json({ error: message }, { status: 500 })
  }
}

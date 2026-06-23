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
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
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
    const imageBlocks = results
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .filter((b): b is Anthropic.ImageBlockParam => b !== null)

    const lengthInstruction =
      lengthOption === 'custom' && customLength
        ? `${customLength}자 내외`
        : (LENGTH_MAP[lengthOption] ?? '1000자 내외')

    const toneInstruction = TONE_MAP[tone] ?? '친근하고 편안한 말투'

    const systemPrompt = `당신은 10년 경력의 한국 파워블로거입니다. 실제 방문 후기처럼 생생하고 꾸며진 블로그 글을 씁니다.

## 글쓰기 스타일
- 1인칭 시점, 친한 친구에게 말하는 것처럼 자연스럽게
- 구체적인 디테일 강조 (맛, 분위기, 직원 친절도, 대기 시간 등)
- 솔직하되 따뜻한 시각 — 단점도 살짝 언급해야 진짜처럼 보임
- "강추", "필수코스" 같은 광고성 표현 금지
- 각 섹션 제목에 이모지 반드시 포함 (✨ 🍽️ 📍 💬 ⭐ 🕐 💡 등 내용에 맞게)
- 문단 사이사이 이모지 활용으로 시각적 포인트

## HTML 구조 (반드시 이 형식으로)
<div style="background:#f8f9fa;border-left:4px solid #5c6ac4;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0">
  <p style="margin:0;font-size:15px;color:#444;line-height:1.8">
    ✏️ <strong>한 줄 요약</strong>: 업체의 핵심 매력을 한 문장으로. 읽는 사람이 바로 가고 싶게.
  </p>
</div>

<p>도입부: 방문 계기나 상황을 감성적으로 시작. 날씨, 동행, 기대감 등 포함.</p>

<h2>✨ [첫 번째 섹션 — 첫인상/외관/분위기]</h2>
<p>...</p>

<!--IMAGE_1-->  ← 사진이 있을 때만

<h2>🍽️ [두 번째 섹션 — 메뉴/음식/서비스 핵심]</h2>
<p>...</p>
<ul>
  <li><strong>메뉴명</strong> — 맛/특징 설명</li>
</ul>

<!--IMAGE_2-->  ← 사진이 있을 때만

<h2>💬 [세 번째 섹션 — 총평/느낀점]</h2>
<p>솔직한 총평. 아쉬운 점 한두 가지도 가볍게 언급.</p>

<h2>📍 방문 정보</h2>
<ul>
  <li>🕐 <strong>영업시간</strong>: ...</li>
  <li>💰 <strong>가격대</strong>: ...</li>
  <li>🚗 <strong>주차</strong>: ...</li>
  <li>📞 <strong>예약</strong>: ...</li>
</ul>

## 제목 스타일
- 감성적이고 구체적으로 (업체명 + 특징/느낌)
- 예시: "[업체명] 솔직 후기 | 친구랑 갔다가 단골됨", "[업체명] 웨이팅 있어도 갈 만한 이유"

## 응답 규칙
- 반드시 유효한 JSON 한 개만 출력, 다른 텍스트 없음
- content 안에 줄바꿈은 \\n 이스케이프 처리

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
  } catch (err) {
    console.error('[generate] error:', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return Response.json({ error: message }, { status: 500 })
  }
}

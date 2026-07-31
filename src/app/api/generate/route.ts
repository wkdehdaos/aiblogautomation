import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPostLimit, isNewMonth, BETA_LIMIT, DEVELOPER_EMAILS } from '@/lib/plans'

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

const SYSTEM_PROMPT = `당신은 10년 경력의 한국 파워블로거입니다.
반드시 아래 형식으로만 응답하세요 (다른 말 없이):

<blogTitle>제목</blogTitle>
<blogContent>
HTML 본문
</blogContent>

## 글쓰기 스타일
- 1인칭 시점, 친한 친구에게 말하듯 자연스럽고 솔직하게
- 구체적인 디테일 (맛, 식감, 분위기, 직원 태도, 가격 체감 등) 생생하게 묘사
- 단점도 한두 가지 솔직하게 언급 — 진짜 후기처럼 보여야 함
- "강추", "필수코스", "강력 추천" 같은 광고성 표현 금지
- 이모지는 맨 앞 인사 👋 딱 하나만, 본문에는 금지
- 숫자 접두어(1. 2. 3.) 부제목 사용 금지

## blogContent HTML 구조 (반드시 준수)
<p style="font-size:28px;text-align:center;margin:0 0 16px">👋</p>
<p style="line-height:1.9;font-size:15px;color:#333">도입...</p>
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>
<!--IMAGE_1-->
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">부제목</h2>
<p style="line-height:1.9;font-size:15px;color:#333">내용...</p>
<div style="text-align:center;margin:28px 0;padding:20px">
  <p style="font-size:13px;color:#aaa;margin:0">"</p>
  <p style="font-size:16px;font-weight:600;color:#333;margin:8px 0;line-height:1.7">핵심 인상 한 문장</p>
  <p style="font-size:13px;color:#aaa;margin:0">"</p>
</div>
<!--IMAGE_2-->
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">방문 정보</h2>
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444;line-height:2.2">
    <li><strong>영업시간</strong> &nbsp; ...</li>
    <li><strong>가격대</strong> &nbsp; ...</li>
    <li><strong>주차</strong> &nbsp; ...</li>
    <li><strong>예약</strong> &nbsp; ...</li>
  </ul>
</div>

## blogTitle 스타일
- 업체명 + 솔직한 느낌/특징을 담은 자연스러운 문장
- 이모지·HTML 태그 없이`

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
  }

  let user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })

  const isDeveloper = DEVELOPER_EMAILS.has(user.email)

  if (!isDeveloper) {
    if (user.betaCount >= BETA_LIMIT) {
      return Response.json(
        { error: '베타 테스트 횟수를 모두 사용했어요. 정식 출시 시 알림을 받으시겠어요?', betaExceeded: true },
        { status: 429 }
      )
    }
    if (user.plan !== 'free') {
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
    }
  }

  // 폼 파싱 + 이미지 처리 (스트림 시작 전에 완료)
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: '요청 파싱 실패' }, { status: 400 })
  }

  const businessName = formData.get('businessName') as string
  const businessInfo = formData.get('businessInfo') as string
  const address = (formData.get('address') as string) || ''
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

  const lengthInstruction = lengthOption === 'custom' && customLength
    ? `${customLength}자 내외`
    : (LENGTH_MAP[lengthOption] ?? '1000자 내외')
  const toneInstruction = TONE_MAP[tone] ?? '친근하고 편안한 말투'

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
      `첨부 사진 ${imageBlocks.length}장. 본문 중간 적절한 위치마다 <!--IMAGE_1-->, <!--IMAGE_2--> ... <!--IMAGE_${imageBlocks.length}--> 마커를 삽입하세요.`,
  ].filter(Boolean).join('\n')

  const userContent: Anthropic.MessageParam['content'] = [
    { type: 'text', text: userLines },
    ...imageBlocks,
  ]

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userId = session.userId
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* 스트림 닫힘 */ }
      }

      try {
        const stream = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        })

        let fullText = ''
        let inContent = false
        let tailBuffer = '' // </blogContent> 분할 감지용 (최대 15자 보류)

        for await (const event of stream) {
          if (event.type !== 'content_block_delta') continue
          if (event.delta.type !== 'text_delta') continue

          const chunk = event.delta.text
          fullText += chunk

          if (!inContent) {
            const idx = fullText.indexOf('<blogContent>')
            if (idx !== -1) {
              inContent = true
              tailBuffer = fullText.slice(idx + '<blogContent>'.length)
            }
          } else {
            tailBuffer += chunk
            const endIdx = tailBuffer.indexOf('</blogContent>')
            if (endIdx !== -1) {
              const toSend = tailBuffer.slice(0, endIdx)
              if (toSend) send({ type: 'content', chunk: toSend })
              tailBuffer = ''
              inContent = false
            } else {
              // </blogContent> 태그가 잘릴 수 있으니 마지막 14자는 보류
              const safe = tailBuffer.slice(0, Math.max(0, tailBuffer.length - 14))
              if (safe) {
                send({ type: 'content', chunk: safe })
                tailBuffer = tailBuffer.slice(safe.length)
              }
            }
          }
        }

        // 최종 파싱
        const titleMatch = fullText.match(/<blogTitle>([\s\S]*?)<\/blogTitle>/)
        const title = titleMatch?.[1]?.trim() ?? `${businessName} 방문 후기`
        const contentMatch = fullText.match(/<blogContent>([\s\S]*?)<\/blogContent>/)
        let content = contentMatch?.[1]?.trim() ?? ''

        if (!content) {
          send({ type: 'error', error: '블로그 내용 생성에 실패했습니다. 다시 시도해주세요.' })
          return
        }

        if (address) {
          const mapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(address)}`
          content += `\n<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">📍 위치 안내</h2>\n<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0 24px;text-align:center">\n  <p style="font-size:14px;color:#444;margin:0 0 12px">${address}</p>\n  <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#03c75a;color:#fff;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none">네이버 지도에서 보기 →</a>\n</div>`
        }

        await prisma.user.update({
          where: { id: userId },
          data: { postCount: { increment: 1 }, betaCount: { increment: 1 } },
        })

        send({ type: 'done', title, content, successIndices })
      } catch (err) {
        console.error('[generate] stream error:', err)
        send({ type: 'error', error: err instanceof Error ? err.message : '알 수 없는 오류' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

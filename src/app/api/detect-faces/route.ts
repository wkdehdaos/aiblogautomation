import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ faces: [] }, { status: 500 })
  }
  try {
    const formData = await req.formData()
    const image = formData.get('image') as File | null
    if (!image) return Response.json({ faces: [] }, { status: 400 })

    const raw = Buffer.from(await image.arrayBuffer())
    const resized = await sharp(raw)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: resized.toString('base64') },
          },
          {
            type: 'text',
            text: 'Find all human faces. Return ONLY a JSON array: [{"x":10,"y":5,"w":20,"h":30},...] where values are percentages (0-100) of image width/height. x,y = top-left corner. If no faces: []. No other text.',
          },
        ],
      }],
    })

    const raw2 = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const match = raw2.match(/\[[\s\S]*\]/)
    const faces = match ? JSON.parse(match[0]) : []
    return Response.json({ faces })
  } catch (err) {
    console.error('[detect-faces]', err)
    return Response.json({ faces: [] })
  }
}

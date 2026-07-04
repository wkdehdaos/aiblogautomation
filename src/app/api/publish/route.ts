import { NextRequest } from 'next/server'
import { publishToNaver } from '@/lib/naverPublish'
import path from 'path'
import fs from 'fs'
import os from 'os'

export async function POST(req: NextRequest) {
  const { title, content, images, font, location } = (await req.json()) as {
    title: string
    content: string
    images: string[] // base64
    font?: string
    location?: string
  }

  if (!title || !content) {
    return Response.json({ success: false, error: '제목과 본문이 필요합니다.', lastStep: '요청 검증' }, { status: 400 })
  }

  // 이미지 base64 → 임시 파일로 저장
  const uploadDir = path.join(os.tmpdir(), 'naver-upload')
  fs.mkdirSync(uploadDir, { recursive: true })

  const imagePaths: string[] = []
  for (let i = 0; i < (images ?? []).length; i++) {
    const filePath = path.join(uploadDir, `naver-img-${Date.now()}-${i}.jpg`)
    fs.writeFileSync(filePath, Buffer.from(images[i], 'base64'))
    imagePaths.push(filePath)
  }

  try {
    const result = await publishToNaver(title, content, imagePaths, font, location)
    return Response.json(result)
  } finally {
    for (const p of imagePaths) {
      fs.unlink(p, () => {})
    }
  }
}

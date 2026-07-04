import { NextRequest } from 'next/server'
import { publishToNaverAI } from '@/lib/naverPublishAI'
import path from 'path'
import fs from 'fs'
import os from 'os'

export const maxDuration = 300 // 5분 타임아웃 (Vercel 등 서버리스 환경)

export async function POST(req: NextRequest) {
  const { title, content, images } = (await req.json()) as {
    title: string
    content: string
    images?: string[] // base64
  }

  if (!title || !content) {
    return Response.json({ success: false, error: '제목과 본문이 필요합니다.' }, { status: 400 })
  }

  // 이미지 base64 → 임시 파일로 저장
  const uploadDir = path.join(os.tmpdir(), 'naver-upload')
  fs.mkdirSync(uploadDir, { recursive: true })

  const imagePaths: string[] = []
  for (let i = 0; i < (images ?? []).length; i++) {
    const filePath = path.join(uploadDir, `naver-img-${Date.now()}-${i}.jpg`)
    fs.writeFileSync(filePath, Buffer.from(images![i], 'base64'))
    imagePaths.push(filePath)
  }

  try {
    const result = await publishToNaverAI(title, content, imagePaths)
    return Response.json(result)
  } finally {
    for (const p of imagePaths) {
      fs.unlink(p, () => {})
    }
  }
}

import { NextRequest } from 'next/server'
import { publishToNaver } from '@/lib/naverPublish'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encrypt'
import path from 'path'
import fs from 'fs'
import os from 'os'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ success: false, error: '로그인이 필요합니다.', lastStep: '인증' }, { status: 401 })
  }

  const { title, content, images, font, location } = (await req.json()) as {
    title: string
    content: string
    images: string[]
    font?: string
    location?: string
  }

  if (!title || !content) {
    return Response.json({ success: false, error: '제목과 본문이 필요합니다.', lastStep: '요청 검증' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { naverSession: true },
  })

  let storageStateData: Record<string, unknown> | undefined
  if (user?.naverSession) {
    const decrypted = decrypt(user.naverSession)
    if (decrypted) {
      try {
        storageStateData = JSON.parse(decrypted) as Record<string, unknown>
      } catch {
        return Response.json({ success: false, error: '세션 데이터 손상. 네이버 계정을 다시 연결해주세요.', lastStep: '세션 로드' }, { status: 400 })
      }
    }
  }

  if (!storageStateData) {
    return Response.json({ success: false, error: '네이버 계정이 연결되지 않았습니다. 네이버 계정을 먼저 연결해주세요.', lastStep: '세션 로드' }, { status: 400 })
  }

  const uploadDir = path.join(os.tmpdir(), 'naver-upload')
  fs.mkdirSync(uploadDir, { recursive: true })

  const imagePaths: string[] = []
  for (let i = 0; i < (images ?? []).length; i++) {
    const filePath = path.join(uploadDir, `naver-img-${Date.now()}-${i}.jpg`)
    fs.writeFileSync(filePath, Buffer.from(images[i], 'base64'))
    imagePaths.push(filePath)
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* closed */ }
      }

      try {
        const result = await publishToNaver(
          title, content, imagePaths, font, location, storageStateData,
          (step) => send({ type: 'progress', step })
        )
        send({ type: 'done', ...result })
      } catch (err) {
        send({ type: 'done', success: false, error: err instanceof Error ? err.message : String(err), lastStep: '알 수 없음' })
      } finally {
        for (const p of imagePaths) fs.unlink(p, () => {})
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

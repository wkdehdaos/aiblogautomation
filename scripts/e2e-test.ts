/**
 * 프로덕션 엔드투엔드 테스트
 * 1. /api/generate  — AI 글 생성 (이미지 포함)
 * 2. /api/publish   — Naver 블로그 발행
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const BASE = 'https://aiblogautomation-production.up.railway.app'
const EMAIL = 'jjangda895@gmail.com'
const PASS  = 'wkdgnt123'

// ── 유틸 ──────────────────────────────────────────────────────────────────
function log(msg: string) { console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`) }

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const cookie = res.headers.get('set-cookie') ?? ''
  const m = cookie.match(/session=([^;]+)/)
  if (!m) throw new Error('로그인 실패: 세션 쿠키 없음')
  log('로그인 성공')
  return m[1]
}

async function makeTestImage(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: color },
  }).jpeg({ quality: 80 }).toBuffer()
}

// ── STEP 1: 글 생성 ───────────────────────────────────────────────────────
async function generate(sessionCookie: string): Promise<{ title: string; content: string; successIndices: number[] }> {
  log('STEP 1: AI 글 생성 요청...')

  const img1 = await makeTestImage({ r: 200, g: 110, b: 90 })
  const img2 = await makeTestImage({ r: 90,  g: 140, b: 210 })

  const fd = new FormData()
  fd.append('businessName', '테스트 카페 블루밍')
  fd.append('businessInfo', '서울 강남구에 위치한 작은 디저트 카페. 수제 케이크와 스페셜티 커피를 판매. 2023년 오픈. 좌석 20석 규모.')
  fd.append('keywords', JSON.stringify(['강남 카페', '수제케이크', '디저트 카페']))
  fd.append('lengthOption', 'medium')
  fd.append('tone', 'friendly')
  fd.append('seoOptimize', 'false')
  fd.append('mustInclude', '')
  fd.append('mustExclude', '')
  fd.append('title', '')
  fd.append('photos', new Blob([img1], { type: 'image/jpeg' }), 'photo1.jpg')
  fd.append('photos', new Blob([img2], { type: 'image/jpeg' }), 'photo2.jpg')

  const res = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { Cookie: `session=${sessionCookie}` },
    body: fd,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`생성 API 실패 (${res.status}): ${err}`)
  }

  const data = await res.json() as { title?: string; content?: string; error?: string; successIndices?: number[] }
  if (data.error) throw new Error(`생성 오류: ${data.error}`)
  if (!data.title || !data.content) throw new Error('title/content 없음')

  log(`글 생성 완료 — 제목: ${data.title}`)
  log(`본문 길이: ${data.content.length}자 / 이미지 마커 수: ${(data.content.match(/<!--IMAGE_\d+-->/g) ?? []).length}개`)
  return { title: data.title, content: data.content, successIndices: data.successIndices ?? [] }
}

// ── STEP 2: 발행 ──────────────────────────────────────────────────────────
async function publish(
  sessionCookie: string,
  title: string,
  content: string,
  images: Buffer[],
): Promise<string> {
  log('STEP 2: Naver 발행 요청...')

  const payload = {
    title,
    content,
    images: images.map(b => b.toString('base64')),
  }

  const res = await fetch(`${BASE}/api/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session=${sessionCookie}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json() as { success: boolean; url?: string; error?: string; lastStep?: string }

  if (!data.success) {
    throw new Error(`발행 실패 (단계: ${data.lastStep}): ${data.error}`)
  }

  log(`발행 성공: ${data.url}`)
  return data.url!
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  log('=== 엔드투엔드 테스트 시작 ===')

  const sessionCookie = await login()

  // 이미지 준비 (generate에서 업로드된 것과 동일)
  const img1 = await makeTestImage({ r: 200, g: 110, b: 90 })
  const img2 = await makeTestImage({ r: 90,  g: 140, b: 210 })

  // STEP 1
  const { title, content } = await generate(sessionCookie)

  // STEP 2
  const url = await publish(sessionCookie, title, content, [img1, img2])

  log('=== 테스트 완료 ===')
  log(`발행 URL: ${url}`)
}

main().catch(err => {
  console.error('\n❌ 테스트 실패:', err.message)
  process.exit(1)
})

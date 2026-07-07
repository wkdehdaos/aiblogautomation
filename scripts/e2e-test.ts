import sharp from 'sharp'

const BASE = 'https://aiblogautomation-production.up.railway.app'
const EMAIL = 'jjangda895@gmail.com'
const PASS  = 'wkdgnt123'

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
  return sharp({ create: { width: 600, height: 400, channels: 3, background: color } })
    .jpeg({ quality: 80 }).toBuffer()
}

async function generate(sessionCookie: string): Promise<{ title: string; content: string }> {
  log('STEP 1: AI 글 생성...')
  const img1 = await makeTestImage({ r: 200, g: 110, b: 90 })
  const img2 = await makeTestImage({ r: 90, g: 140, b: 210 })
  const fd = new FormData()
  fd.append('businessName', '테스트 카페 블루밍')
  fd.append('businessInfo', '서울 강남구 디저트 카페. 수제 케이크와 스페셜티 커피.')
  fd.append('keywords', JSON.stringify(['강남 카페', '수제케이크']))
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
  if (!res.ok) throw new Error(`생성 API 실패 (${res.status}): ${await res.text()}`)
  const data = await res.json() as { title?: string; content?: string; error?: string }
  if (data.error) throw new Error(`생성 오류: ${data.error}`)
  log(`글 생성 완료 — 제목: ${data.title}`)
  return { title: data.title!, content: data.content! }
}

async function publish(sessionCookie: string, title: string, content: string, images: Buffer[]): Promise<string> {
  log('STEP 2: Naver 발행...')
  const res = await fetch(`${BASE}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `session=${sessionCookie}` },
    body: JSON.stringify({ title, content, images: images.map(b => b.toString('base64')) }),
  })
  const data = await res.json() as { success: boolean; url?: string; error?: string; lastStep?: string }
  if (!data.success) throw new Error(`발행 실패 (단계: ${data.lastStep}): ${data.error}`)
  log(`발행 성공: ${data.url}`)
  return data.url!
}

async function main() {
  log('=== E2E 테스트 시작 ===')
  const cookie = await login()
  const img1 = await makeTestImage({ r: 200, g: 110, b: 90 })
  const img2 = await makeTestImage({ r: 90, g: 140, b: 210 })
  const { title, content } = await generate(cookie)
  const url = await publish(cookie, title, content, [img1, img2])
  log(`=== 완료: ${url} ===`)
}

main().catch(err => { console.error('❌ 실패:', err.message); process.exit(1) })

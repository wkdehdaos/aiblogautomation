import path from 'path'
import fs from 'fs'
import { publishToNaver } from '../src/lib/naverPublish'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')

async function main() {
  if (!fs.existsSync(SESSION_PATH)) { console.error('naver-session.json 없음'); process.exit(1) }
  const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8')) as Record<string, unknown>

  const img1 = path.resolve(process.cwd(), 'test-img1.jpg')
  const img2 = path.resolve(process.cwd(), 'test-img2.jpg')

  const title = `[로컬 발행 테스트] ${new Date().toLocaleString('ko-KR')}`
  const content = `<p style="line-height:1.9;font-size:15px;color:#333">본문 검증 테스트입니다.</p>
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">섹션 A</h2>
<p style="line-height:1.9;font-size:15px;color:#333">이미지 삽입 전 텍스트입니다.</p>
<!--IMAGE_1-->
<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">섹션 B</h2>
<p style="line-height:1.9;font-size:15px;color:#333">이미지 삽입 후 텍스트입니다.</p>
<!--IMAGE_2-->
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444">
    <li><strong>테스트</strong> 로컬 + 이미지 2장</li>
  </ul>
</div>`

  console.log('제목:', title)
  const result = await publishToNaver(title, content, [img1, img2], undefined, undefined, sessionData)
  if (result.success) {
    console.log('\n✅ 발행 성공:', result.url)
  } else {
    console.error('\n❌ 발행 실패:', result.error, '/ 단계:', result.lastStep)
    process.exit(1)
  }
}

main().catch(err => { console.error('예외:', err); process.exit(1) })

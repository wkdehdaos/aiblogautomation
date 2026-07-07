import path from 'path'
import fs from 'fs'
import { publishToNaver } from '../src/lib/naverPublish'

// .env.local 로드
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

  // 테스트 이미지 2장
  const img1 = path.resolve(process.cwd(), 'test-img1.jpg')
  const img2 = path.resolve(process.cwd(), 'test-img2.jpg')

  if (!fs.existsSync(img1) || !fs.existsSync(img2)) {
    console.error('테스트 이미지 없음:', img1, img2)
    process.exit(1)
  }

  const title = `[이미지 포함 발행 테스트] ${new Date().toLocaleString('ko-KR')}`

  // 실제 AI 생성 포맷 — <!--IMAGE_1-->, <!--IMAGE_2--> 마커 포함
  const content = `<p style="font-size:28px;text-align:center;margin:0 0 16px">👋</p>

<p style="line-height:1.9;font-size:15px;color:#333">안녕하세요! 이미지 포함 자동 발행 테스트입니다. 이미지가 두 장 포함된 글이 정상적으로 발행되는지 확인합니다.</p>

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">첫 번째 이미지</h2>
<p style="line-height:1.9;font-size:15px;color:#333">아래에 첫 번째 이미지가 들어갑니다. 에디터에서 이미지 업로드 후 본문과 어울리게 배치됩니다.</p>

<!--IMAGE_1-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">두 번째 이미지</h2>
<p style="line-height:1.9;font-size:15px;color:#333">두 번째 이미지도 정상적으로 업로드되는지 확인합니다. 네이버 CDN에 업로드 후 본문에 삽입됩니다.</p>

<!--IMAGE_2-->

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">마무리</h2>
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444;line-height:2.2">
    <li><strong>테스트 항목</strong> &nbsp; 이미지 2장 포함 발행</li>
    <li><strong>발행 시각</strong> &nbsp; ${new Date().toISOString()}</li>
  </ul>
</div>`

  console.log('제목:', title)
  console.log('이미지:', [img1, img2].map(p => path.basename(p)))
  console.log('발행 시작...\n')

  const result = await publishToNaver(title, content, [img1, img2], undefined, undefined, sessionData)

  if (result.success) {
    console.log('\n✅ 발행 성공:', result.url)
  } else {
    console.error('\n❌ 발행 실패:', result.error, '/ 단계:', result.lastStep)
    process.exit(1)
  }
}

main().catch(err => { console.error('예외:', err); process.exit(1) })

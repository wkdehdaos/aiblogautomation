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

  // 실제 AI 생성 포맷과 동일한 복잡한 HTML
  const title = `[본문입력 수정 테스트] ${new Date().toLocaleString('ko-KR')}`
  const content = `<p style="font-size:28px;text-align:center;margin:0 0 16px">👋</p>

<p style="line-height:1.9;font-size:15px;color:#333">안녕하세요! 오늘은 자동 발행 테스트 글을 작성해봤습니다. 본문 입력이 제대로 되는지 확인하는 용도입니다.</p>

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">첫 번째 섹션</h2>
<p style="line-height:1.9;font-size:15px;color:#333">이 섹션에는 본문 내용이 들어갑니다. inline style이 포함된 HTML이 정상적으로 에디터에 입력되는지 검증합니다.</p>

<h2 style="font-size:17px;font-weight:700;color:#222;margin:32px 0 10px">방문 정보</h2>
<div style="background:#f7f8fc;border-radius:8px;padding:20px 24px;margin:12px 0">
  <ul style="margin:0;padding-left:4px;list-style:none;font-size:14px;color:#444;line-height:2.2">
    <li><strong>테스트 항목</strong> &nbsp; 본문 HTML 삽입 검증</li>
    <li><strong>발행 시각</strong> &nbsp; ${new Date().toISOString()}</li>
  </ul>
</div>`

  console.log('제목:', title)
  console.log('발행 시작 (복잡한 HTML)...\n')

  const result = await publishToNaver(title, content, [], undefined, undefined, sessionData)

  if (result.success) {
    console.log('\n✅ 발행 성공:', result.url)
  } else {
    console.error('\n❌ 발행 실패:', result.error, '/ 단계:', result.lastStep)
    process.exit(1)
  }
}

main().catch(err => { console.error('예외:', err); process.exit(1) })

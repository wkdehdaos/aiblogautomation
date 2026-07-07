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
  if (!fs.existsSync(SESSION_PATH)) {
    console.error('naver-session.json 없음')
    process.exit(1)
  }

  const sessionData = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8')) as Record<string, unknown>

  const title = `[자동발행 테스트] ${new Date().toLocaleString('ko-KR')} 제목 셀렉터 수정 검증`
  const content = `<p>이 글은 자동 발행 테스트입니다.</p><p>제목 입력 셀렉터 수정 후 정상 동작 여부를 확인합니다.</p><p>발행 시각: ${new Date().toISOString()}</p>`

  console.log('제목:', title)
  console.log('발행 시작...\n')

  const result = await publishToNaver(title, content, [], undefined, undefined, sessionData)

  if (result.success) {
    console.log('\n✅ 발행 성공')
    console.log('URL:', result.url)
  } else {
    console.error('\n❌ 발행 실패')
    console.error('오류:', result.error)
    console.error('실패 단계:', result.lastStep)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('예외:', err)
  process.exit(1)
})

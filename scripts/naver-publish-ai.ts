import path from 'path'
import fs from 'fs'

// .env.local 로드
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
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
loadEnvLocal()

import { publishToNaverAI } from '../src/lib/naverPublishAI'

const TITLE = 'AI Computer Use 테스트'
const CONTENT = 'Anthropic Computer Use API를 이용한 자동 발행 테스트입니다.\n\nClaude가 화면을 보고 스스로 판단해서 글을 작성합니다.'

async function main() {
  console.log('=== Naver Blog AI 발행 테스트 ===')
  console.log(`제목: ${TITLE}`)
  console.log(`본문: ${CONTENT.slice(0, 50)}...`)
  console.log('발행 시작...\n')

  const result = await publishToNaverAI(TITLE, CONTENT)

  if (result.success) {
    console.log('\n✅ 발행 성공!')
    if (result.url) console.log(`URL: ${result.url}`)
  } else {
    console.error('\n❌ 발행 실패:', result.error)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('예기치 못한 오류:', err)
  process.exit(1)
})

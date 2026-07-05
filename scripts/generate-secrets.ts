import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const ENV_FILE = path.join(process.cwd(), '.env.local')

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex')
}

function updateEnvFile(updates: Record<string, string>): void {
  let content = ''
  try {
    content = fs.readFileSync(ENV_FILE, 'utf8')
  } catch {
    // 파일 없으면 빈 문자열로 시작
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm')
    if (regex.test(content)) {
      // 이미 존재하면 덮어쓰지 않음 (--force 없이)
      console.log(`  [skip] ${key} 이미 존재합니다. 교체하려면 --force 옵션을 사용하세요.`)
    } else {
      content = content.trimEnd()
      content += (content ? '\n' : '') + `${key}=${value}\n`
      console.log(`  [add]  ${key}`)
    }
  }

  fs.writeFileSync(ENV_FILE, content, 'utf8')
}

function main(): void {
  const force = process.argv.includes('--force')
  let content = ''
  try {
    content = fs.readFileSync(ENV_FILE, 'utf8')
  } catch { /* 없으면 빈 문자열 */ }

  const newSecrets: Record<string, string> = {}

  const encKeyMissing = !/^ENCRYPTION_KEY=/m.test(content)
  const jwtSecretMissing = !/^JWT_SECRET=/m.test(content)

  if (encKeyMissing || force) {
    newSecrets['ENCRYPTION_KEY'] = randomHex(32)  // 32 bytes = AES-256 키
  }
  if (jwtSecretMissing || force) {
    newSecrets['JWT_SECRET'] = randomHex(64)       // 64 bytes = 강력한 서명 키
  }

  if (Object.keys(newSecrets).length === 0) {
    console.log('모든 시크릿이 이미 설정되어 있습니다.')
    console.log('강제 재생성하려면: npx tsx scripts/generate-secrets.ts --force')
    return
  }

  if (force) {
    // --force: 기존 값 덮어쓰기
    for (const [key, value] of Object.entries(newSecrets)) {
      const regex = new RegExp(`^${key}=.*$`, 'm')
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`)
        console.log(`  [replace] ${key}`)
      } else {
        content = content.trimEnd() + (content ? '\n' : '') + `${key}=${value}\n`
        console.log(`  [add]  ${key}`)
      }
    }
    fs.writeFileSync(ENV_FILE, content, 'utf8')
  } else {
    updateEnvFile(newSecrets)
  }

  console.log(`\n.env.local 업데이트 완료: ${ENV_FILE}`)
  console.log('주의: 이 파일은 절대 git에 커밋하지 마세요.')
}

main()

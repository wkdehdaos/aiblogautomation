'use strict'

const path = require('path')
const os = require('os')
const readline = require('readline')
const https = require('https')

// ── 브라우저 경로 (pkg 환경에서 Chrome/Edge 우선 사용) ────────────
const BROWSERS_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'NaverLoginApp',
  'ms-playwright'
)
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_DIR

const { chromium } = require('playwright')

const SERVER = 'https://aiblogautomation-production.up.railway.app'

// ── 콘솔 입력 ─────────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

function askPassword(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt)

    if (!process.stdin.isTTY) {
      // TTY 없으면(파이프 등) 일반 readline 사용
      const rl = readline.createInterface({ input: process.stdin, output: null })
      rl.question('', ans => { rl.close(); process.stdout.write('\n'); resolve(ans) })
      return
    }

    let pw = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onKey = (ch) => {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onKey)
        process.stdout.write('\n')
        resolve(pw)
      } else if (ch === '') {
        process.exit()
      } else if (ch === '' || ch === '\b') {
        if (pw.length > 0) {
          pw = pw.slice(0, -1)
          process.stdout.clearLine(0)
          process.stdout.cursorTo(0)
          process.stdout.write(prompt + '*'.repeat(pw.length))
        }
      } else {
        pw += ch
        process.stdout.write('*')
      }
    }
    process.stdin.on('data', onKey)
  })
}

// ── HTTPS POST ────────────────────────────────────────────────────
function httpsPost(urlStr, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const u = new URL(urlStr)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }) }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('\x1Bc') // 화면 초기화

  console.log('╔════════════════════════════════════════════╗')
  console.log('║  네이버 블로그 자동화 - 네이버 계정 연결  ║')
  console.log('╚════════════════════════════════════════════╝')
  console.log()

  // ── 1단계: 앱 로그인 ─────────────────────────────────────────
  console.log('1단계: 블로그 자동화 사이트 계정으로 로그인하세요.')
  console.log()
  const email = (await ask('  이메일: ')).trim()
  const password = await askPassword('  비밀번호: ')
  console.log()

  process.stdout.write('  서버에 연결 중...')

  let sessionCookie
  try {
    const res = await httpsPost(`${SERVER}/api/auth/login`, { email, password })

    if (!res.data?.ok) {
      console.log(' 실패\n')
      console.log('❌', res.data?.error ?? '이메일/비밀번호를 확인해주세요.')
      await ask('\n  아무 키나 눌러 종료...')
      process.exit(1)
    }

    const raw = (res.headers['set-cookie'] ?? []).find(c => c.includes('session='))
    sessionCookie = raw?.split(';')[0]
    if (!sessionCookie) throw new Error('세션 쿠키를 받지 못했습니다.')

    console.log(' 완료')
    console.log('  ✅ 앱 로그인 성공!')
    console.log()
  } catch (e) {
    console.log(' 오류\n')
    console.log('❌ 서버 연결 실패:', e.message)
    await ask('\n  아무 키나 눌러 종료...')
    process.exit(1)
  }

  // ── 2단계: 브라우저 실행 ──────────────────────────────────────
  console.log('2단계: 네이버 로그인 창을 엽니다.')
  process.stdout.write('  브라우저 실행 중...')

  // Chrome → Edge → Playwright 내장 순으로 시도
  let browser
  for (const channel of ['chrome', 'msedge', null]) {
    try {
      browser = await chromium.launch({
        headless: false,
        ...(channel ? { channel } : {}),
      })
      break
    } catch { /* 다음 시도 */ }
  }

  if (!browser) {
    console.log(' 실패\n')
    console.log('❌ 브라우저를 찾을 수 없습니다.')
    console.log('   Chrome 또는 Edge를 설치하거나,')
    console.log('   터미널에서 "npx playwright install chromium" 실행 후 다시 시도하세요.')
    await ask('\n  아무 키나 눌러 종료...')
    process.exit(1)
  }

  console.log(' 완료')
  console.log()

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('https://nid.naver.com/nidlogin.login')

  console.log('  ⚡ 브라우저에서 네이버에 로그인해주세요.')
  console.log('     로그인 완료 시 자동으로 세션이 저장됩니다. (최대 3분)')
  console.log()

  // ── 3단계: 로그인 감지 + 세션 업로드 ────────────────────────
  let done = false

  const finish = async () => {
    if (done) return
    done = true

    let storageState
    try {
      storageState = await context.storageState()
      await browser.close().catch(() => {})
    } catch (e) {
      console.log('❌ 세션 추출 실패:', e.message)
      await ask('\n  아무 키나 눌러 종료...')
      process.exit(1)
    }

    process.stdout.write('  세션을 서버로 전송 중...')

    try {
      const res = await httpsPost(
        `${SERVER}/api/naver/upload-session`,
        { session: storageState },
        { Cookie: sessionCookie }
      )

      if (res.data?.ok) {
        console.log(' 완료')
        console.log()
        console.log('✅ 네이버 연결 완료!')
        console.log('   이제 블로그 자동화 사이트에서 발행할 수 있어요.')
      } else {
        console.log(' 실패')
        console.log()
        console.log('❌ 연결 실패:', res.data?.error ?? '서버 오류가 발생했습니다.')
        console.log('   사이트에서 naver-session.json을 직접 업로드해주세요.')
      }
    } catch (e) {
      console.log(' 오류')
      console.log()
      console.log('❌ 전송 오류:', e.message)
    }

    await ask('\n  아무 키나 눌러 종료...')
    process.exit(0)
  }

  // 로그인 완료 감지 (blog.naver.com 또는 naver.com으로 이동 시)
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    const isLoggedIn =
      url.includes('naver.com') &&
      !url.includes('nidlogin') &&
      !url.includes('nid.naver.com')
    if (isLoggedIn) await finish()
  })

  // 3분 타임아웃
  setTimeout(async () => {
    if (!done) {
      console.log('  ⏰ 3분이 지났습니다. 현재 상태로 저장합니다...')
      console.log()
      await finish()
    }
  }, 3 * 60 * 1000)

  // 브라우저 닫힘 감지
  browser.on('disconnected', async () => {
    if (!done) {
      console.log()
      console.log('  브라우저가 닫혔습니다. 로그인이 완료되지 않았습니다.')
      await ask('\n  아무 키나 눌러 종료...')
      process.exit(1)
    }
  })

  // 무한 대기
  await new Promise(() => {})
}

main().catch(async (e) => {
  console.error('\n예상치 못한 오류:', e.message)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise(r => rl.question('\n  아무 키나 눌러 종료...', r))
  rl.close()
  process.exit(1)
})

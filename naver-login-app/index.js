'use strict'

const path = require('path')
const os = require('os')
const readline = require('readline')

// ── 브라우저 경로 설정 ─────────────────────────────────────────────
// Chrome/Edge가 없는 경우 Playwright 자체 브라우저 사용
const BROWSERS_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'NaverLoginApp',
  'ms-playwright'
)
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_DIR

const { chromium } = require('playwright')
const fetch = require('node-fetch')

const SERVER = 'https://aiblogautomation-production.up.railway.app'
const TIMEOUT_MS = 3 * 60 * 1000 // 3분

// ── 유틸 ─────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

function waitKey(msg) {
  if (msg) process.stdout.write(msg)
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        resolve()
      })
    } else {
      setTimeout(resolve, 3000)
    }
  })
}

// ── 메인 ─────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write('\x1Bc')
  console.log('┌────────────────────────────────────────────┐')
  console.log('│  네이버 블로그 자동화 - 네이버 계정 연결  │')
  console.log('└────────────────────────────────────────────┘')
  console.log()

  // ── 토큰 파싱 (--token=xxx 인자 또는 직접 입력) ──────────────────
  let token = null
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--token=(.+)$/)
    if (m) { token = m[1].trim(); break }
  }

  if (!token) {
    console.log('사이트에서 "② 내 토큰 복사" 버튼을 클릭한 후')
    console.log('아래에 붙여넣고 Enter를 누르세요.')
    console.log('(Windows: 우클릭 또는 Ctrl+V로 붙여넣기)')
    console.log()
    token = await ask('토큰: ')
    console.log()
  }

  if (!token) {
    console.log('❌ 토큰이 입력되지 않았습니다.')
    await waitKey('\n아무 키나 누르면 종료합니다...')
    process.exit(1)
  }

  // ── 브라우저 실행 (Chrome → Edge → Playwright 내장) ──────────────
  console.log('네이버 로그인 창이 열립니다...')

  let browser
  for (const channel of ['chrome', 'msedge', null]) {
    try {
      browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) })
      break
    } catch { /* 다음 시도 */ }
  }

  if (!browser) {
    console.log()
    console.log('❌ 브라우저를 실행할 수 없습니다.')
    console.log('   Chrome 또는 Microsoft Edge를 설치해주세요.')
    await waitKey('\n아무 키나 누르면 종료합니다...')
    process.exit(1)
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('https://nid.naver.com/nidlogin.login')

  console.log()
  console.log('⚡ 브라우저에서 네이버에 로그인해주세요.')
  console.log('   로그인이 완료되면 자동으로 세션이 저장됩니다.')
  console.log('   (최대 3분 대기)')
  console.log()

  let done = false

  const finish = async (timedOut) => {
    if (done) return
    done = true

    if (timedOut) {
      console.log('⏰ 시간 초과. 다시 실행해주세요.')
      await browser.close().catch(() => {})
      await waitKey('\n아무 키나 누르면 종료합니다...')
      process.exit(1)
    }

    let storageState
    try {
      storageState = await context.storageState()
    } catch (e) {
      console.log('❌ 세션 추출 실패:', e.message)
      await browser.close().catch(() => {})
      await waitKey('\n아무 키나 누르면 종료합니다...')
      process.exit(1)
    }

    await browser.close().catch(() => {})

    process.stdout.write('세션을 서버로 전송 중...')
    try {
      const res = await fetch(`${SERVER}/api/naver/upload-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ session: storageState }),
      })
      const data = await res.json()

      if (data.ok) {
        console.log(' 완료')
        console.log()
        console.log('✅ 네이버 연결 완료! 이 창을 닫아도 됩니다.')
      } else {
        console.log(' 실패')
        console.log()
        console.log('❌ 연결 실패:', data.error ?? '서버 오류')
        if (String(data.error).includes('만료') || String(data.error).includes('유효하지')) {
          console.log('   토큰이 만료됐습니다. 사이트에서 토큰을 다시 복사하세요.')
        }
      }
    } catch (e) {
      console.log(' 오류')
      console.log()
      console.log('❌ 전송 오류:', e.message)
    }

    await waitKey('\n아무 키나 누르면 종료합니다...')
    process.exit(0)
  }

  // 로그인 완료 감지
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (url.includes('naver.com') && !url.includes('nidlogin') && !url.includes('nid.naver.com')) {
      await finish(false)
    }
  })

  // 3분 타임아웃
  setTimeout(() => finish(true), TIMEOUT_MS)

  // 브라우저 강제 종료 감지
  browser.on('disconnected', async () => {
    if (!done) {
      done = true
      console.log()
      console.log('브라우저가 닫혔습니다.')
      await waitKey('\n아무 키나 누르면 종료합니다...')
      process.exit(0)
    }
  })

  await new Promise(() => {})
}

main().catch(async (e) => {
  console.error('\n오류:', e.message)
  await new Promise(r => setTimeout(r, 3000))
  process.exit(1)
})

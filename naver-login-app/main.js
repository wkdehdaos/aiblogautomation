'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')

// ── 로그 ─────────────────────────────────────────────────────────────
const ERR_LOG = path.join(os.homedir(), 'naver-login-error.log')
const DBG_LOG = path.join(os.homedir(), 'naver-login-debug.log')

// 실행마다 디버그 로그 초기화
try { fs.writeFileSync(DBG_LOG, `=== 시작 ${new Date().toISOString()} ===\n`) } catch (_) {}

function log(msg) {
  try { fs.appendFileSync(DBG_LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch (_) {}
}

function writeError(text) {
  try { fs.writeFileSync(ERR_LOG, `[${new Date().toISOString()}]\n${text}\n`) } catch (_) {}
  log('ERROR: ' + text.split('\n')[0])
}

log('프로세스 시작 PID=' + process.pid)
log('resourcesPath=' + (process.resourcesPath || 'undefined'))
log('__dirname=' + __dirname)
log('isPackaged=' + (process.defaultApp === undefined))
log('argv=' + process.argv.join(' '))

// ── 에러 핸들러 (맨 먼저) ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  writeError(err.stack)
  try { require('electron').dialog.showErrorBox('오류', err.message) } catch (_) {}
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason)
  writeError(msg)
  try { require('electron').dialog.showErrorBox('비동기 오류', String(reason)) } catch (_) {}
})

// ── Electron ──────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain } = require('electron')
log('electron require 완료')

// GPU 크래시 방지
app.disableHardwareAcceleration()
log('HW 가속 비활성화')

// 단일 인스턴스
const gotLock = app.requestSingleInstanceLock()
log('singleInstanceLock=' + gotLock)
if (!gotLock) {
  log('이미 실행 중 → 즉시 종료 (app.exit)')
  app.exit(0)   // app.quit()은 비동기라 whenReady까지 실행됨 → app.exit()으로 즉시 종료
}
app.on('second-instance', () => {
  log('두 번째 인스턴스 감지 → 기존 창 포커스')
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})


const SERVER = process.env.NAVER_SERVER ?? 'https://aiblogautomation-production.up.railway.app'
const TIMEOUT_MS = 3 * 60 * 1000

let win = null

function createWindow() {
  log('createWindow() 진입')
  const htmlPath = path.join(__dirname, 'renderer', 'index.html')
  log('htmlPath=' + htmlPath + ' exists=' + fs.existsSync(htmlPath))

  win = new BrowserWindow({
    width: 400,
    height: 300,
    useContentSize: true,
    resizable: false,
    center: true,
    show: false,
    title: '네이버 연결',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)

  win.on('closed', () => { log('창 닫힘'); win = null })

  win.webContents.on('did-fail-load', (_, code, desc) => {
    log('did-fail-load code=' + code + ' desc=' + desc)
    writeError('페이지 로드 실패 ' + code + ': ' + desc)
  })

  win.webContents.on('render-process-gone', (_, details) => {
    log('render-process-gone: ' + JSON.stringify(details))
    writeError('렌더러 프로세스 사망: ' + JSON.stringify(details))
  })

  win.loadFile(htmlPath)
    .then(() => log('loadFile resolved'))
    .catch((err) => {
      log('loadFile rejected: ' + err.message)
      writeError('loadFile 실패: ' + err.stack)
    })

  log('BrowserWindow 생성 완료')
}

function send(state, message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('state', { state, message: message || '' })
    log('send state=' + state)
  } else {
    log('send 실패: win 없음 state=' + state)
  }
}

// ── 로그인 플로우 ─────────────────────────────────────────────────────
async function runLogin(token) {
  log('runLogin() 시작')
  let chromium
  try {
    ;({ chromium } = require('playwright-core'))
    log('playwright-core require 완료')
  } catch (e) {
    log('playwright-core require 실패: ' + e.message)
    send('error', 'playwright 로드 실패\n' + e.message)
    return
  }

  send('loading', '브라우저를 시작하는 중...')

  let browser = null
  const attempts = [
    () => { log('Edge 채널 시도'); return chromium.launch({ headless: false, channel: 'msedge' }) },
    () => { log('Chrome 채널 시도'); return chromium.launch({ headless: false, channel: 'chrome' }) },
  ]
  for (const attempt of attempts) {
    try { browser = await attempt(); log('브라우저 실행 성공'); break } catch (e) { log('시도 실패: ' + e.message) }
  }

  if (!browser) {
    log('모든 브라우저 시도 실패')
    send('error', 'Edge 또는 Chrome이 필요합니다.\n설치 후 다시 시도해주세요.')
    return
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('https://nid.naver.com/nidlogin.login')
  log('네이버 로그인 페이지 열림')

  // "로그인 상태 유지" 자동 체크 — 장기 세션 쿠키 발급 (30일)
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.evaluate(() => {
    const keep = document.querySelector('#keep_login_check, #stay_signed_in, [name="keepLogin"]')
    if (keep && !keep.checked) keep.click()
  }).catch(() => {})
  log('로그인 상태 유지 체크 시도')

  send('loading', '네이버 로그인 중...\n브라우저에서 로그인해주세요.')

  let done = false

  async function finish(timedOut) {
    if (done) return
    done = true
    log('finish() timedOut=' + timedOut)

    if (timedOut) {
      await browser.close().catch(() => {})
      send('error', '시간 초과 (3분)\n앱을 다시 실행해주세요.')
      return
    }

    let storageState
    try {
      storageState = await context.storageState()
      log('세션 추출 완료')
    } catch (e) {
      await browser.close().catch(() => {})
      send('error', '세션 추출 실패\n' + e.message)
      return
    }

    await browser.close().catch(() => {})
    send('loading', '세션을 서버로 전송 중...')

    try {
      const res = await fetch(`${SERVER}/api/naver/upload-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ session: storageState }),
      })
      const data = await res.json()
      log('서버 응답: ' + JSON.stringify(data).slice(0, 100))

      if (data.ok) {
        send('success', '네이버 연결 완료!\n이 창을 닫아도 됩니다.')
      } else {
        const err = String(data.error ?? '서버 오류')
        const hint = (err.includes('만료') || err.includes('유효하지')) ? '\n사이트에서 토큰을 다시 복사하세요.' : ''
        send('error', `연결 실패: ${err}${hint}`)
      }
    } catch (e) {
      log('fetch 오류: ' + e.message)
      send('error', '전송 오류\n' + e.message)
    }
  }

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    log('framenavigated: ' + url)
    if (url.includes('naver.com') && !url.includes('nidlogin') && !url.includes('nid.naver.com')) {
      finish(false).catch((err) => { log('finish 오류: ' + err.message); send('error', err.message) })
    }
  })

  setTimeout(() => finish(true).catch((err) => send('error', err.message)), TIMEOUT_MS)

  browser.on('disconnected', () => {
    log('브라우저 disconnected done=' + done)
    if (!done) { done = true; send('error', '브라우저가 종료되었습니다.') }
  })
}

function safeRunLogin(token) {
  runLogin(token).catch((err) => {
    writeError(err.stack)
    send('error', '실행 오류\n' + err.message)
  })
}

// ── 앱 시작 ───────────────────────────────────────────────────────────
app.on('will-finish-launching', () => log('will-finish-launching'))

app.whenReady()
  .then(() => {
    if (!gotLock) return   // 두 번째 인스턴스는 여기서도 막음
    log('app.whenReady() 완료')
    createWindow()

    win.webContents.once('did-finish-load', () => {
      log('did-finish-load 이벤트')
      win.show()
      send('loading', '초기화 중...')

      const args = process.argv.slice(app.isPackaged ? 1 : 2)
      let token = null
      for (const arg of args) {
        const m = arg.match(/^--token=(.+)$/)
        if (m) { token = m[1].trim(); break }
      }
      log('token=' + (token ? '있음' : '없음'))

      setTimeout(() => {
        if (token) safeRunLogin(token)
        else send('input')
      }, 300)
    })
  })
  .catch((err) => {
    log('whenReady 실패: ' + err.message)
    writeError('whenReady 실패: ' + err.stack)
  })

ipcMain.on('submit-token', (_, token) => {
  log('submit-token IPC 수신')
  if (token?.trim()) safeRunLogin(token.trim())
})

ipcMain.on('close-window', () => { log('close-window IPC'); win?.close() })

app.on('window-all-closed', () => { log('window-all-closed → quit'); app.quit() })

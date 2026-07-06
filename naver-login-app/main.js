'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const os = require('os')

process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'NaverLoginApp', 'ms-playwright'
)

const SERVER = 'https://aiblogautomation-production.up.railway.app'
const TIMEOUT_MS = 3 * 60 * 1000

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 400,
    resizable: false,
    title: 'Naver Login Helper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function send(state, message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('state', { state, message: message || '' })
  }
}

async function runLogin(token) {
  let chromium
  try {
    ;({ chromium } = require('playwright'))
  } catch (e) {
    send('error', 'playwright 로드 실패: ' + e.message)
    return
  }

  send('loading', '브라우저를 시작하는 중...')

  let browser = null
  for (const channel of ['chrome', 'msedge', null]) {
    try {
      browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) })
      break
    } catch { /* try next */ }
  }

  if (!browser) {
    send('error', '브라우저를 실행할 수 없습니다.\nChrome 또는 Edge를 설치해주세요.')
    return
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('https://nid.naver.com/nidlogin.login')

  send('browser-open', '브라우저에서 네이버에 로그인해주세요.\n로그인 완료 시 자동으로 처리됩니다.\n(최대 3분)')

  let done = false

  async function finish(timedOut) {
    if (done) return
    done = true

    if (timedOut) {
      await browser.close().catch(() => {})
      send('error', '시간이 초과되었습니다. (3분)\n앱을 다시 실행해주세요.')
      return
    }

    let storageState
    try {
      storageState = await context.storageState()
    } catch (e) {
      await browser.close().catch(() => {})
      send('error', '세션 추출 실패: ' + e.message)
      return
    }

    await browser.close().catch(() => {})
    send('sending', '세션을 서버로 전송 중...')

    try {
      const fetch = require('node-fetch')
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
        send('success', '네이버 연결이 완료되었습니다!\n이 창을 닫아도 됩니다.')
      } else {
        const err = String(data.error ?? '서버 오류')
        const hint = (err.includes('만료') || err.includes('유효하지'))
          ? '\n사이트에서 토큰을 다시 복사해주세요.' : ''
        send('error', `연결 실패: ${err}${hint}`)
      }
    } catch (e) {
      send('error', '전송 오류: ' + e.message)
    }
  }

  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (url.includes('naver.com') && !url.includes('nidlogin') && !url.includes('nid.naver.com')) {
      await finish(false)
    }
  })

  setTimeout(() => finish(true), TIMEOUT_MS)

  browser.on('disconnected', () => {
    if (!done) { done = true; send('error', '브라우저가 종료되었습니다.') }
  })
}

app.whenReady().then(() => {
  createWindow()

  const args = process.argv.slice(app.isPackaged ? 1 : 2)
  let token = null
  for (const arg of args) {
    const m = arg.match(/^--token=(.+)$/)
    if (m) { token = m[1].trim(); break }
  }

  win.webContents.once('did-finish-load', () => {
    if (token) runLogin(token)
    else send('input')
  })
})

ipcMain.on('submit-token', (_, token) => {
  if (token?.trim()) runLogin(token.trim())
})

ipcMain.on('close-window', () => win?.close())

app.on('window-all-closed', () => app.quit())

import { chromium } from 'playwright'
import path from 'path'

const SESSION_PATH = path.resolve(process.cwd(), 'naver-session.json')
const LOGIN_URL = 'https://nid.naver.com/nidlogin.login'
const WAIT_SECONDS = 60

async function main() {
  console.log('브라우저를 실행합니다...')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(LOGIN_URL)
  console.log(`\n네이버 로그인 창이 열렸습니다.`)
  console.log('ID/비밀번호를 직접 입력하고 로그인해 주세요. (캡차/인증도 직접 처리)')
  console.log(`로그인 완료 후 ${WAIT_SECONDS}초 안에 자동으로 세션이 저장됩니다.\n`)

  // 로그인 완료 감지: 로그인 성공 시 naver.com으로 리다이렉트됨
  let saved = false

  const saveSession = async () => {
    if (saved) return
    saved = true
    await context.storageState({ path: SESSION_PATH })
    console.log(`\n세션 저장 완료: ${SESSION_PATH}`)
    await browser.close()
  }

  // 로그인 후 페이지 이동 감지
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (url.includes('naver.com') && !url.includes('nidlogin')) {
      console.log('로그인 성공 감지! 세션을 저장합니다...')
      await saveSession()
    }
  })

  // 최대 대기 후 강제 저장
  await new Promise<void>((resolve) => {
    setTimeout(async () => {
      if (!saved) {
        console.log('\n대기 시간 종료. 현재 상태로 세션을 저장합니다...')
        await saveSession()
      }
      resolve()
    }, WAIT_SECONDS * 1000)
  })
}

main().catch((err) => {
  console.error('오류 발생:', err)
  process.exit(1)
})

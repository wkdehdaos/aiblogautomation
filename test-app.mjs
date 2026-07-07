import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false, slowMo: 300 })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 800 })

const EMAIL = 'test@test.com'
const PASS = 'test1234'

// 1. 로그인 페이지
await page.goto('http://localhost:3000/login')
await page.screenshot({ path: 'test-01-login.png' })
console.log('1. 로그인 페이지 로드 OK')

// 테스트 유저 준비
let loginRes = await page.request.post('http://localhost:3000/api/auth/login', {
  data: { email: EMAIL, password: PASS }
})
let loginData = await loginRes.json()
if (!loginData.ok) {
  const regRes = await page.request.post('http://localhost:3000/api/auth/register', {
    data: { email: EMAIL, password: PASS, name: '테스트유저' }
  })
  console.log('회원가입:', JSON.stringify(await regRes.json()))
  loginRes = await page.request.post('http://localhost:3000/api/auth/login', {
    data: { email: EMAIL, password: PASS }
  })
  loginData = await loginRes.json()
}
console.log('로그인 결과:', loginData.ok ? 'OK' : loginData.error)

// UI 로그인
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForURL('http://localhost:3000/', { timeout: 6000 }).catch(() => {})
await page.screenshot({ path: 'test-02-home.png' })
console.log('2. 홈 URL:', page.url())

// 3. 요금제 페이지
await page.goto('http://localhost:3000/pricing')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: 'test-03-pricing.png' })
const planCards = await page.locator('[class*="rounded-2xl"]').count()
console.log('3. 요금제 페이지 - 카드 수:', planCards)

// 4. 대시보드 페이지
await page.goto('http://localhost:3000/dashboard')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: 'test-04-dashboard.png' })
console.log('4. 대시보드 OK')

// 5. payment status API (로그인 쿠키 사용)
const statusRes = await page.request.get('http://localhost:3000/api/payment/status')
const statusData = await statusRes.json()
console.log('5. 플랜 상태:', JSON.stringify(statusData))

// 6. generate 한도 초과 테스트 (plan=free, limit=3)
console.log('\n--- 한도 초과 테스트 ---')
const fd = new FormData()
fd.append('businessName', '테스트 카페')
fd.append('businessInfo', '테스트용 카페입니다.')
fd.append('keywords', '[]')
fd.append('lengthOption', 'short')
fd.append('tone', 'friendly')
fd.append('seoOptimize', 'false')
fd.append('mustInclude', '')
fd.append('mustExclude', '')
fd.append('title', '')
const genRes = await page.request.post('http://localhost:3000/api/generate', { multipart: fd })
console.log('  generate 응답 상태:', genRes.status())
if (genRes.status() === 429) {
  const errData = await genRes.json()
  console.log('  한도 초과 메시지:', errData.error)
} else {
  console.log('  (AI 호출 - 응답 대기 중...)')
}

// 7. 개인정보처리방침 푸터
await page.goto('http://localhost:3000/privacy')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: 'test-05-privacy.png' })
const footerLinks = await page.locator('footer a').allTextContents()
console.log('\n6. 푸터 링크:', footerLinks)

// 8. 이용약관
await page.goto('http://localhost:3000/terms')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: 'test-06-terms.png' })
console.log('7. 이용약관 OK')

// 9. payment/success 페이지 (파라미터 없이)
await page.goto('http://localhost:3000/payment/success')
await page.waitForLoadState('networkidle')
await page.screenshot({ path: 'test-07-success.png' })
const bodyText = await page.locator('body').textContent()
console.log('8. 결제 성공 페이지 (잘못된 접근):', bodyText?.includes('잘못된 접근') ? '에러 처리 OK' : bodyText?.slice(0, 50))

await browser.close()
console.log('\n✅ 전체 테스트 완료')

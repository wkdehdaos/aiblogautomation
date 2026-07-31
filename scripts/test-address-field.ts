import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const SHOT_DIR = path.resolve(process.cwd(), 'debug-screenshots', 'address-test')
fs.mkdirSync(SHOT_DIR, { recursive: true })

async function snap(page: import('playwright').Page, name: string) {
  const file = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  📸 ${name}.png`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.setDefaultTimeout(15000)

  // 1. 로그인
  await page.goto('http://localhost:3000/login')
  await page.fill('input[type="email"]', 'test@blogdy.dev')
  await page.fill('input[type="password"]', 'test1234!')
  await page.click('button[type="submit"]')
  await page.waitForURL('http://localhost:3000/', { timeout: 10000 })
  await page.waitForTimeout(2500)
  await snap(page, '01-after-login')
  console.log('✅ 로그인 성공')

  // 2. 주소 필드 visible 확인
  const addressInput = page.locator('input[placeholder*="서울특별시"]')
  const isVisible = await addressInput.isVisible({ timeout: 5000 }).catch(() => false)
  console.log(`${isVisible ? '✅' : '❌'} 주소 필드 visible: ${isVisible}`)
  await snap(page, '02-form-with-address')

  // 3. 테스트 자동입력 → 주소 자동완성 확인
  await page.click('button:has-text("테스트 자동입력")')
  await page.waitForTimeout(800)
  const autoValue = await addressInput.inputValue().catch(() => '')
  console.log(`${autoValue ? '✅' : '❌'} 테스트 자동입력 주소: "${autoValue}"`)
  await snap(page, '03-autofill-with-address')

  // 4. 주소 직접 입력
  await addressInput.fill('서울특별시 강남구 역삼동 테헤란로 123')
  await page.waitForTimeout(300)
  const manualValue = await addressInput.inputValue()
  console.log(`${manualValue ? '✅' : '❌'} 직접 입력 주소: "${manualValue}"`)
  await snap(page, '04-manual-address-input')

  // 5. 업체명/소개도 확인 (자동입력 됐는지)
  const bizName = await page.locator('input[placeholder*="카페"]').inputValue().catch(() => '')
  console.log(`✅ 업체명: "${bizName}"`)

  console.log(`\n스크린샷: ${SHOT_DIR}`)
  await browser.close()
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1) })

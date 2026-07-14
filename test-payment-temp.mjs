import { chromium } from 'playwright'
const BASE = 'https://aiblogautomation-production.up.railway.app'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', 'a01067709308@gmail.com')
await page.fill('input[type="password"]', 'sosjbw4239@@')
await page.click('button[type="submit"]')
await page.waitForTimeout(2000)

await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const buttons = await page.locator('button').allTextContents()
console.log('버튼 목록:', buttons)
await browser.close()

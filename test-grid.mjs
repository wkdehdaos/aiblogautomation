import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1280, height: 900 })
await page.goto('http://localhost:3000/pricing')
await page.waitForLoadState('networkidle')

const grid = await page.locator('.grid').first()
const box = await grid.boundingBox()
console.log('grid box:', JSON.stringify(box))

const children = await grid.locator('> div').all()
for (let i = 0; i < children.length; i++) {
  const cb = await children[i].boundingBox()
  console.log(`card[${i}]:`, JSON.stringify(cb))
}

await browser.close()

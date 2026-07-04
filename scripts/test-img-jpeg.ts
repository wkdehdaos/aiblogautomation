import path from 'path'
import fs from 'fs'

function loadEnv() {
  for (const f of ['.env.local', '.en.local']) {
    const p = path.resolve(process.cwd(), f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue
      const i = t.indexOf('='); if (i === -1) continue
      const k = t.slice(0, i).trim(), v = t.slice(i+1).trim().replace(/^["']|["']$/g, '')
      if (k && !(k in process.env)) process.env[k] = v
    }
  }
}
loadEnv()

import { publishToNaver } from '../src/lib/naverPublish'

const imgPath = path.resolve(process.cwd(), 'debug-screenshots/test-photo.jpg')

const content = `<p style="line-height:1.9;font-size:15px;color:#333">이미지 업로드 테스트 본문입니다.</p>

<!--IMAGE_1-->

<p style="line-height:1.9;font-size:15px;color:#333">이미지 삽입 후 텍스트입니다.</p>`

console.log('이미지 경로:', imgPath, '존재:', require('fs').existsSync(imgPath))
console.log('발행 시작...')

publishToNaver('이미지 테스트 발행', content, [imgPath]).then(r => {
  console.log('결과:', JSON.stringify(r, null, 2))
}).catch(e => {
  console.error('오류:', e)
})

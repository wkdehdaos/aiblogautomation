import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

function slugify(text: string): string {
  return text
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '')
}

function buildMarkdown(
  title: string,
  content: string,
  businessName: string,
  keywords: string[],
  createdAt: string,
): string {
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: "${createdAt}"`,
    `business: "${businessName.replace(/"/g, '\\"')}"`,
    `keywords: [${keywords.map((k) => `"${k}"`).join(', ')}]`,
    '---',
    '',
  ].join('\n')
  return frontmatter + content
}

async function gitCommitPush(message: string) {
  const root = process.cwd()
  try {
    await execAsync('git add posts/', { cwd: root })
    await execAsync(`git commit -m "${message}"`, { cwd: root })
    await execAsync('git push', { cwd: root })
  } catch (err) {
    // 변경사항 없거나 push 실패해도 저장 자체는 성공으로 처리
    console.warn('[save] git 실패:', err)
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const { title, content, businessName, keywords, publishedUrl } = (await req.json()) as {
      title: string
      content: string
      businessName: string
      keywords?: string[]
      publishedUrl?: string
    }

    if (!title || !content) {
      return Response.json({ error: '제목과 본문이 필요합니다.' }, { status: 400 })
    }

    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const slug = slugify(title)
    const fileName = `${dateStr}-${slug}.md`
    const postsDir = path.join(process.cwd(), 'posts')
    const filePath = path.join(postsDir, fileName)

    // 마크다운 파일 작성
    fs.mkdirSync(postsDir, { recursive: true })
    const markdown = buildMarkdown(title, content, businessName, keywords ?? [], now.toISOString())
    fs.writeFileSync(filePath, markdown, 'utf8')

    // DB 저장
    const post = await prisma.blogPost.create({
      data: {
        userId: session.userId,
        title,
        content,
        businessName,
        keywords: JSON.stringify(keywords ?? []),
        filePath: `posts/${fileName}`,
        publishedUrl: publishedUrl ?? null,
      },
    })

    // GitHub push (비동기, 실패해도 OK)
    gitCommitPush(`post: ${title.slice(0, 50)}`).catch(() => {})

    return Response.json({ ok: true, id: post.id, filePath: `posts/${fileName}` })
  } catch (err) {
    console.error('[posts/save]', err)
    return Response.json({ error: '저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

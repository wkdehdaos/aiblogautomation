import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ user: null }, { status: 401 })
  }
  return Response.json({ user: session })
}

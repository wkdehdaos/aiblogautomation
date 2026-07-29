export async function POST() {
  return Response.json(
    { error: '이 엔드포인트는 더 이상 사용되지 않습니다. /api/payment/confirm을 사용하세요.' },
    { status: 410 },
  )
}

export async function PUT() {
  return Response.json(
    { error: '이 엔드포인트는 더 이상 사용되지 않습니다.' },
    { status: 410 },
  )
}

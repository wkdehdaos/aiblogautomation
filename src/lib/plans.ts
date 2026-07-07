export type Plan = 'free' | 'basic' | 'pro'

export const PLANS = {
  free:  { label: '무료',   price: 0,      limit: 3,        priceLabel: '무료' },
  basic: { label: '베이직', price: 9900,   limit: 30,       priceLabel: '월 9,900원' },
  pro:   { label: '프로',   price: 29900,  limit: Infinity, priceLabel: '월 29,900원' },
} as const satisfies Record<Plan, { label: string; price: number; limit: number; priceLabel: string }>

export function getPostLimit(plan: string): number {
  return PLANS[plan as Plan]?.limit ?? PLANS.free.limit
}

export function isNewMonth(resetAt: Date): boolean {
  const now = new Date()
  return now.getFullYear() !== resetAt.getFullYear() || now.getMonth() !== resetAt.getMonth()
}

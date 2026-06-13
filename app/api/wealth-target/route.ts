import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json([], { status: 400 })
  const name = req.nextUrl.searchParams.get('name') ?? ''

  const baseUrl = process.env.WEALTH_MANAGER_URL
  const apiKey = process.env.WEALTH_MANAGER_API_KEY
  if (!baseUrl || !apiKey) return NextResponse.json([])

  try {
    const res = await fetch(`${baseUrl}/api/public/target?ticker=${encodeURIComponent(ticker)}&name=${encodeURIComponent(name)}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([])
  }
}

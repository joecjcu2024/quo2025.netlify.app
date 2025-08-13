
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const base = process.env.AT_BASE_ID as string
    const apiKey = process.env.AT_API_KEY as string
    const table = process.env.AT_TABLE_NAME || 'Quotes'
    if (!base || !apiKey) {
      return NextResponse.json({ ok: false, error: 'Missing AT_BASE_ID or AT_API_KEY' }, { status: 400 })
    }
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`
    const records = (body.items || []).map((it: any) => ({
      fields: {
        service: it.service ?? '',
        description: it.desc ?? it.description ?? '',
        unit: it.unit ?? '',
        qty: it.qty ?? 0,
        price: it.price ?? 0,
      }
    }))
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    })
    const json = await resp.json()
    if (!resp.ok) {
      return NextResponse.json({ ok: false, error: json }, { status: resp.status })
    }
    return NextResponse.json({ ok: true, result: json })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

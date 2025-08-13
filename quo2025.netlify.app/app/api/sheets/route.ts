
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GS_CLIENT_EMAIL,
        private_key: (process.env.GS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GS_SHEET_ID as string
    if (!spreadsheetId) {
      return NextResponse.json({ ok: false, error: 'Missing GS_SHEET_ID' }, { status: 400 })
    }

    // Prepare rows
    const rows = [['service','description','unit','qty','price']]
    for (const it of (body.items || [])) {
      rows.push([it.service ?? '', it.desc ?? it.description ?? '', it.unit ?? '', it.qty ?? 0, it.price ?? 0])
    }

    // Write items to Sheet1 starting A1
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })

    // Optional: write totals to another tab
    if (body.header) {
      const meta = [
        ['company', body.header.company || ''],
        ['quoteNo', body.header.quoteNo || ''],
        ['quoteDate', body.header.quoteDate || ''],
        ['currency', body.currency || ''],
        ['taxRate', body.taxRate ?? ''],
      ]
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Meta!A1',
        valueInputOption: 'RAW',
        requestBody: { values: meta },
      }).catch(() => {}) // ignore if Meta sheet not exists
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}

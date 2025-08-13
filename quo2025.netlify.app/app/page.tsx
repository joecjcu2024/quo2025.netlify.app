'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'

const z = (n:number) => String(n).padStart(2,'0')
const dateStr = () => { const d=new Date(); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}` }
const moneyFmt = (v:number, digits=0) => v.toLocaleString('zh-TW',{minimumFractionDigits:digits, maximumFractionDigits:digits})

const SYMBOL: Record<string,string> = { TWD:'NT$', USD:'$', JPY:'¥', VND:'₫', EUR:'€' }
const DEFAULT_RATES: Record<string, number> = { TWD:1, USD:32.5, JPY:0.22, VND:0.00125, EUR:35.0 }

function parseCSV(str:string){
  const rows:string[][]=[]; let cur=''; let row:string[]=[]; let inQ=false
  const pushCell=()=>{ row.push(cur); cur='' }
  const pushRow=()=>{ rows.push(row); row=[] }
  for(let i=0;i<str.length;i++){
    const c=str[i]
    if(inQ){
      if(c==='"') { if(str[i+1]==='"'){ cur+='"'; i++ } else { inQ=false } }
      else cur+=c
    }else{
      if(c==='"') inQ=true
      else if(c===',') pushCell()
      else if(c==='\n'){ pushCell(); pushRow() }
      else if(c==='\r'){}
      else cur+=c
    }
  }
  pushCell(); pushRow();
  return rows
}
const escCSV = (s:any)=>{ s=String(s??''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s }

function downloadFile(content:string, mime:string, filename:string){
  const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob)
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function useRowDnD(ids:string[], onMove:(from:number,to:number)=>void){
  const dragIdx = useRef<number|null>(null)
  const handlers = {
    onDragStart:(i:number)=>()=>{ dragIdx.current=i },
    onDragOver:(i:number)=> (e:React.DragEvent)=>{ e.preventDefault() },
    onDrop:(i:number)=>()=>{ if(dragIdx.current===null) return; const from=dragIdx.current; const to=i; dragIdx.current=null; if(from!==to) onMove(from,to) },
  }
  return ids.map((_,i)=>({
    draggable:true,
    onDragStart: handlers.onDragStart(i),
    onDragOver: handlers.onDragOver(i),
    onDrop: handlers.onDrop(i),
  }))
}

function SignaturePad({value,onChange}:{value?:string,onChange:(dataUrl:string)=>void}){
  const cvsRef = useRef<HTMLCanvasElement|null>(null)
  const drawing = useRef(false)
  const [size,setSize] = useState({w:560,h:120})
  useEffect(()=>{
    const handle = ()=>{
      const w = Math.min(700, (cvsRef.current?.parentElement?.clientWidth||600)-16)
      setSize({w, h: Math.round(w*0.22)})
    }
    handle(); window.addEventListener('resize',handle); return ()=> window.removeEventListener('resize',handle)
  },[])
  useEffect(()=>{ if(value && cvsRef.current){ const img=new Image(); img.onload=()=>{ const ctx=cvsRef.current!.getContext('2d')!; ctx.clearRect(0,0,size.w,size.h); ctx.drawImage(img,0,0,size.w,size.h)}; img.src=value }},[value,size])
  const draw = (x:number,y:number)=>{ const ctx=cvsRef.current!.getContext('2d')!; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#111827'; ctx.lineWidth=2.2; ctx.lineTo(x,y); ctx.stroke() }
  const pos = (e:any)=>{ const r=cvsRef.current!.getBoundingClientRect(); const x= (e.touches?e.touches[0].clientX:e.clientX) - r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x, y} }
  const onDown=(e:any)=>{ const {x,y}=pos(e); const ctx=cvsRef.current!.getContext('2d')!; drawing.current=true; ctx.beginPath(); ctx.moveTo(x,y) }
  const onMove=(e:any)=>{ if(!drawing.current) return; const {x,y}=pos(e); draw(x,y) }
  const onUp=()=>{ if(!drawing.current) return; drawing.current=false; onChange(cvsRef.current!.toDataURL('image/png')) }
  const clear=()=>{ const ctx=cvsRef.current!.getContext('2d')!; ctx.clearRect(0,0,size.w,size.h); onChange('') }
  return (
    <div className="space-y-2">
      <canvas ref={cvsRef} width={size.w} height={size.h}
        className="border border-slate-300 rounded-xl bg-white touch-none"
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
      />
      <div className="flex gap-2">
        <button className="px-3 py-1.5 rounded-lg border" onClick={clear}>清除</button>
        <button className="px-3 py-1.5 rounded-lg border" onClick={()=> onChange(cvsRef.current!.toDataURL('image/png'))}>儲存簽名</button>
      </div>
    </div>
  )
}

export default function Page(){
  type Item = { id:string, selected?:boolean, service:string, desc:string, unit:string, qty:number, price:number }
  const [items,setItems] = useState<Item[]>([])
  const [currency,setCurrency] = useState<'TWD'|'USD'|'JPY'|'VND'|'EUR'>('TWD')
  const [rates,setRates] = useState<Record<string,number>>({...DEFAULT_RATES})
  const [digits,setDigits] = useState(0)
  const [taxRate,setTaxRate] = useState(0.05)
  const [secondary,setSecondary] = useState<'none'|'USD'|'TWD'|'JPY'|'VND'|'EUR'>('none')
  const [compact,setCompact] = useState(true)
  const [printScale,setPrintScale] = useState(1)
  const [logo,setLogo] = useState<string>('')
  const [stamp,setStamp] = useState<string>('')
  const [sign,setSign] = useState<string>('')
  const [header,setHeader] = useState({
    title:'服務估價單', company:'拓曜知識實驗有限公司', quoteDate:dateStr(), quoteNo:'',
    eventName:'', eventDate:dateStr(), eventTime:'13:00–15:00', guests:'', venue:'', payment:'', validity:'發出日起 14 日',
    clientCompany:'', clientContact:'', clientPhone:'', clientEmail:'',
    ourTaxId:'', ourEmail:'', ourPhone:'', ourAddr:''
  })

  useEffect(()=>{
    if(typeof window==='undefined') return
    const raw = localStorage.getItem('quote_draft_react_v1')
    if(raw){ try{ const d=JSON.parse(raw); restore(d) }catch{} }
    else{
      setItems([
        {id:crypto.randomUUID(), service:'行銷貼文企劃與撰寫', desc:'5則社群主題貼文撰寫（含Hashtag與CTA）', unit:'組', qty:1, price:12000},
        {id:crypto.randomUUID(), service:'社群成效資料視覺化分析', desc:'30天KPI成效追蹤 × 月度效益報告', unit:'月', qty:1, price:8000},
        {id:crypto.randomUUID(), service:'AI 教師助教＆規則設定', desc:'FAQ彙整＋初始Prompt設計＋10組情境測試校正', unit:'套', qty:1, price:15000},
      ])
    }
  },[])
  useEffect(()=>{ if(typeof window==='undefined') return; const draft=collectJSON(); localStorage.setItem('quote_draft_react_v1', JSON.stringify(draft)) })

  function restore(data:any){
    if(data.header) setHeader((h)=>({...h,...data.header}))
    if(data.currency) setCurrency(data.currency)
    if(data.rates) setRates((r)=>({...r,...data.rates}))
    if(data.digits!=null) setDigits(data.digits)
    if(data.taxRate!=null) setTaxRate(data.taxRate)
    if(Array.isArray(data.items)) setItems(data.items.map((it:any)=>({...it, id:crypto.randomUUID()})))
    if(data.logo) setLogo(data.logo); if(data.stamp) setStamp(data.stamp); if(data.signature) setSign(data.signature)
  }

  const net = useMemo(()=> items.reduce((s,it)=> s+it.qty*it.price,0),[items])
  const tax = useMemo(()=> net * taxRate,[net,taxRate])
  const gross = net + tax

  const symbol = SYMBOL[currency]
  const toMoney = (n:number)=> `${symbol} ${moneyFmt(n, digits)}`
  const convert = (n:number, toCur:string)=> n * (rates[currency]/rates[toCur])

  const dnd = useRowDnD(items.map(i=>i.id), (from,to)=>{
    setItems(prev=>{ const arr=[...prev]; const [m]=arr.splice(from,1); arr.splice(to,0,m); return arr })
  })

  const updateItem = (id:string, patch:Partial<Item>)=> setItems(prev=> prev.map(it=> it.id===id? {...it,...patch}:it))
  const addItem = ()=> setItems(prev=> [...prev, {id:crypto.randomUUID(), service:'', desc:'', unit:'', qty:1, price:0}])
  const delSel = ()=> setItems(prev=> prev.filter(it=> !it.selected))
  const dupSel = ()=> setItems(prev=> prev.flatMap(it=> it.selected? [it, {...it, id:crypto.randomUUID()}] : [it]))

  const onChangeCurrency = (cur:any)=>{
    const old=currency; const nv=cur as typeof currency
    if(old===nv) return; const ratio = rates[old]/rates[nv]
    setItems(prev=> prev.map(it=> ({...it, price: +(it.price*ratio)})))
    setCurrency(nv)
  }

  const pickImage = (onLoad:(dataUrl:string)=>void)=>{
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.onchange=()=>{
      const f=inp.files?.[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=> onLoad(String(reader.result)); reader.readAsDataURL(f)
    }; inp.click()
  }

  const exportCSV = ()=>{
    const head=['service','description','unit','qty','price']
    const lines = [head.join(',')].concat(items.map(it=> [it.service,it.desc,it.unit,it.qty,it.price].map(escCSV).join(',')))
    downloadFile(lines.join('\n'),'text/csv',`quote_items_${Date.now()}.csv`)
  }
  const exportJSON = ()=> downloadFile(JSON.stringify(collectJSON(),null,2),'application/json',`quote_${Date.now()}.json`)
  const importFile = ()=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,.json'; inp.onchange=()=>{
    const f=inp.files?.[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ try{
      if(f.name.endsWith('.json')) restore(JSON.parse(String(rd.result)))
      else {
        const rows=parseCSV(String(rd.result)); if(!rows.length) return
        const header=rows[0].map(s=> s.trim().toLowerCase()); if(['service','服務','服務項目'].some(k=> header.includes(k))) rows.shift()
        setItems(rows.filter(r=> r.join('').trim()!=='').map(r=>({ id:crypto.randomUUID(), service:r[0]||'', desc:r[1]||'', unit:r[2]||'', qty:parseFloat(r[3]||'1'), price:parseFloat(r[4]||'0') })))
      }
    }catch(e){ alert('匯入失敗：'+(e as any).message) } }; rd.readAsText(f,'utf-8') }; inp.click() }

  const collectJSON = ()=>({ header, currency, rates, digits, taxRate, items, logo, stamp, signature:sign })

  useEffect(()=>{
    const root=document.documentElement
    root.style.setProperty('--print-scale', String(printScale))
    root.style.setProperty('--print-lh', compact? '1.25':'1.5')
    root.style.setProperty('--print-ls', compact? '0.01em':'0.02em')
  },[printScale,compact])

  const fitOnePage = ()=>{
    const paper=document.getElementById('paper')!
    const pagePx = Math.floor((281/25.4)*96)
    const h = paper.scrollHeight
    setPrintScale(Math.min(1, pagePx / h))
    window.print()
    setTimeout(()=> setPrintScale(1), 100)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="sticky top-0 z-50 backdrop-blur bg-white/90 border-b">
        <div className="max-w-5xl mx-auto px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            <button className="btn" onClick={addItem}>新增項目</button>
            <button className="btn" onClick={dupSel}>複製選取</button>
            <button className="btn btn-danger" onClick={delSel}>刪除選取</button>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={importFile}>匯入 CSV/JSON</button>
            <button className="btn" onClick={exportCSV}>匯出 CSV</button>
            <button className="btn" onClick={exportJSON}>匯出 JSON</button>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2 items-center">
            <select className="input" value={currency} onChange={e=> onChangeCurrency(e.target.value)}>
              <option value="TWD">TWD</option><option value="USD">USD</option><option value="JPY">JPY</option><option value="VND">VND</option><option value="EUR">EUR</option>
            </select>
            <label className="text-sm text-slate-500">小數位</label>
            <input className="input w-16" type="number" min={0} max={4} value={digits} onChange={e=> setDigits(parseInt(e.target.value||'0'))} />
            <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" checked={compact} onChange={e=> setCompact(e.target.checked)} />列印壓縮</label>
            <button className="btn btn-primary" onClick={()=> window.print()}>預覽列印</button>
            <button className="btn btn-primary" onClick={fitOnePage}>一鍵單頁 PDF</button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-3 pb-24">
        <div id="paper" className="bg-white shadow-xl border rounded-2xl overflow-hidden print:shadow-none print:border-0">
          <div className="p-4 bg-gradient-to-b from-slate-100 to-white">
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-28 h-16 border rounded-xl bg-white flex items-center justify-center overflow-hidden">
                {logo? <img src={logo} alt="logo" className="max-w-full max-h-full"/> : <span className="text-slate-400 text-sm">上傳Logo</span>}
              </div>
              <div className="flex-1">
                <input className="text-xl font-bold w-full outline-none" value={header.company} onChange={e=> setHeader({...header, company:e.target.value})} />
                <div className="text-slate-500 text-sm">{header.title}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn" onClick={()=> pickImage(setLogo)}>上傳 Logo</button>
                <button className="btn" onClick={()=> pickImage(setStamp)}>上傳 統編章</button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 mt-3 text-sm">
              <div className="col-span-2"><label className="label">估價日</label><input className="input" type="date" value={header.quoteDate} onChange={e=> setHeader({...header, quoteDate:e.target.value})}/></div>
              <div className="col-span-3"><label className="label">估價單號</label><input className="input" value={header.quoteNo} onChange={e=> setHeader({...header, quoteNo:e.target.value})} placeholder="例如 Q3-123456001"/></div>
              <div className="col-span-3"><label className="label">活動名稱</label><input className="input" value={header.eventName} onChange={e=> setHeader({...header, eventName:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">活動日期</label><input className="input" type="date" value={header.eventDate} onChange={e=> setHeader({...header, eventDate:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">時間</label><input className="input" value={header.eventTime} onChange={e=> setHeader({...header, eventTime:e.target.value})}/></div>

              <div className="col-span-1"><label className="label">來賓數</label><input className="input" value={header.guests} onChange={e=> setHeader({...header, guests:e.target.value})}/></div>
              <div className="col-span-3"><label className="label">地點</label><input className="input" value={header.venue} onChange={e=> setHeader({...header, venue:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">付款</label><input className="input" value={header.payment} onChange={e=> setHeader({...header, payment:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">有效期</label><input className="input" value={header.validity} onChange={e=> setHeader({...header, validity:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">幣別</label>
                <select className="input" value={currency} onChange={e=> onChangeCurrency(e.target.value)}>
                  <option value="TWD">TWD</option><option value="USD">USD</option><option value="JPY">JPY</option><option value="VND">VND</option><option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 mt-2 text-sm">
              <div className="col-span-6 border rounded-xl p-2">
                <div className="font-medium text-slate-600 mb-1">客戶資料</div>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12"><label className="label">客戶公司</label><input className="input" value={header.clientCompany} onChange={e=> setHeader({...header, clientCompany:e.target.value})}/></div>
                  <div className="col-span-6"><label className="label">聯絡人</label><input className="input" value={header.clientContact} onChange={e=> setHeader({...header, clientContact:e.target.value})}/></div>
                  <div className="col-span-6"><label className="label">電話</label><input className="input" value={header.clientPhone} onChange={e=> setHeader({...header, clientPhone:e.target.value})}/></div>
                  <div className="col-span-12"><label className="label">Email</label><input className="input" value={header.clientEmail} onChange={e=> setHeader({...header, clientEmail:e.target.value})}/></div>
                </div>
              </div>
              <div className="col-span-6 border rounded-xl p-2 relative">
                <div className="font-medium text-slate-600 mb-1">客戶簽章 / Signature</div>
                <SignaturePad value={sign} onChange={setSign} />
                {stamp && <img src={stamp} alt="stamp" className="hidden print:block absolute right-3 bottom-3 w-24 opacity-70"/>}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 mt-2 text-sm">
              <div className="col-span-3"><label className="label">統編</label><input className="input" value={header.ourTaxId} onChange={e=> setHeader({...header, ourTaxId:e.target.value})}/></div>
              <div className="col-span-3"><label className="label">Email</label><input className="input" value={header.ourEmail} onChange={e=> setHeader({...header, ourEmail:e.target.value})}/></div>
              <div className="col-span-3"><label className="label">電話</label><input className="input" value={header.ourPhone} onChange={e=> setHeader({...header, ourPhone:e.target.value})}/></div>
              <div className="col-span-3"><label className="label">地址</label><input className="input" value={header.ourAddr} onChange={e=> setHeader({...header, ourAddr:e.target.value})}/></div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col style={{width:40}}/><col style={{width:180}}/><col/><col style={{width:80}}/><col style={{width:90}}/><col style={{width:140}}/><col style={{width:140}}/>
                </colgroup>
                <thead>
                  <tr className="bg-blue-50 text-slate-900 font-semibold">
                    <th className="th">選</th>
                    <th className="th">服務項目</th>
                    <th className="th">內容說明</th>
                    <th className="th">單位</th>
                    <th className="th text-right">數量</th>
                    <th className="th text-right">單價</th>
                    <th className="th text-right">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it,idx)=> (
                    <tr key={it.id} draggable {...dnd[idx]} className="hover:bg-slate-50">
                      <td className="td text-center"><input type="checkbox" checked={!!it.selected} onChange={e=> updateItem(it.id,{selected:e.target.checked})}/></td>
                      <td className="td"><input className="cell" value={it.service} onChange={e=> updateItem(it.id,{service:e.target.value})}/></td>
                      <td className="td"><textarea className="cell h-14" value={it.desc} onChange={e=> updateItem(it.id,{desc:e.target.value})}/></td>
                      <td className="td text-center"><input className="cell text-center" value={it.unit} onChange={e=> updateItem(it.id,{unit:e.target.value})}/></td>
                      <td className="td text-right"><input className="cell text-right" type="number" min={0} value={it.qty} onChange={e=> updateItem(it.id,{qty:+e.target.value})}/></td>
                      <td className="td text-right"><input className="cell text-right" type="number" min={0} value={it.price} onChange={e=> updateItem(it.id,{price:+e.target.value})}/></td>
                      <td className="td text-right" style={{fontVariantNumeric:'tabular-nums'}}>{toMoney(it.qty*it.price)}{secondary!=='none' && <div className="text-slate-400 text-xs">{SYMBOL[secondary]} {moneyFmt(convert(it.qty*it.price, secondary), digits)}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3 p-4 pt-0">
            <div className="col-span-8">
              <div className="border rounded-xl p-3">
                <div className="font-medium text-slate-600 mb-1">備註 / 條款</div>
                <textarea className="w-full min-h-[120px] outline-none" defaultValue={"1. 本報價為概估價格，若需開立發票加計稅額。\n2. 出差車馬費：台北以北每次 > 1 小時另報價。\n3. 教學 + 諮詢（含簡報、教材）：NT$1,800+ / hr。\n4. 影片：1080p MP4，需求 4K 需另報價。\n5. 付款：簽約後 1 報 1 款。\n6. 有效期：發出日起 14 日。"} />
              </div>
            </div>
            <div className="col-span-4">
              <div className="border rounded-xl p-3 space-y-2">
                <div className="font-medium text-slate-600">金額統計</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="label">稅率</label>
                  <input className="input" type="number" step={0.01} value={taxRate} onChange={e=> setTaxRate(parseFloat(e.target.value||'0'))}/>
                  <label className="label">小數位數</label>
                  <input className="input" type="number" min={0} max={4} value={digits} onChange={e=> setDigits(parseInt(e.target.value||'0'))}/>
                  <label className="label">次要幣別顯示</label>
                  <select className="input" value={secondary} onChange={e=> setSecondary(e.target.value as any)}>
                    <option value="none">不顯示</option>
                    {(['TWD','USD','JPY','VND','EUR'] as const).filter(c=> c!==currency).map(c=> <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label className="label">印刷縮放（僅列印）</label>
                  <input className="input" type="number" step={0.01} min={0.6} max={1} value={printScale} onChange={e=> setPrintScale(parseFloat(e.target.value||'1'))}/>
                </div>
                <div className="flex justify-between py-1"><span>未稅小計</span><b>{toMoney(net)}{secondary!=='none' && <span className="text-slate-400 text-xs ml-2">{SYMBOL[secondary]} {moneyFmt(convert(net, secondary), digits)}</span>}</b></div>
                <div className="flex justify-between py-1"><span>稅額</span><b>{toMoney(tax)}{secondary!=='none' && <span className="text-slate-400 text-xs ml-2">{SYMBOL[secondary]} {moneyFmt(convert(tax, secondary), digits)}</span>}</b></div>
                <div className="flex justify-between py-2 bg-blue-50 rounded-lg px-2"><span className="font-semibold">含稅合計</span><b className="font-bold">{toMoney(gross)}{secondary!=='none' && <span className="text-slate-500 text-xs ml-2">{SYMBOL[secondary]} {moneyFmt(convert(gross, secondary), digits)}</span>}</b></div>
              </div>

              <div className="border rounded-xl p-3 mt-2 space-y-2">
                <div className="font-medium text-slate-600">匯率（1 單位外幣 = ? TWD）</div>
                {(['TWD','USD','JPY','VND','EUR'] as const).map(k=> (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <div className="w-12">{k}</div>
                    <input className="input w-28" type="number" value={rates[k]} onChange={e=> setRates(prev=> ({...prev, [k]: parseFloat(e.target.value||'0')}))}/>
                    <div className="text-slate-500">{k==='TWD'? '（基準）': ''}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <button className="btn" onClick={()=> downloadFile('service,description,unit,qty,price\n範例服務,範例說明,項,1,1000','text/csv','示範_items.csv')}>下載範例CSV</button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-slate-500 text-xs px-4 py-3 border-t relative">
            <div>產生時間：{new Date().toLocaleString('zh-TW',{dateStyle:'medium', timeStyle:'short'})}</div>
            {stamp && <img src={stamp} alt="stamp" className="absolute right-6 -top-6 w-24 opacity-50"/>}
            <div>※ 客戶簽章表示同意本估價內容與條款</div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .btn{ @apply px-3 py-1.5 rounded-lg border bg-white hover:bg-slate-50; }
        .btn-primary{ @apply bg-blue-600 text-white border-blue-600 hover:bg-blue-700; }
        .btn-danger{ @apply bg-red-500 text-white border-red-500 hover:bg-red-600; }
        .input{ @apply w-full rounded-lg border border-slate-300 px-2 py-1.5 outline-none; }
        .label{ @apply text-slate-500 text-sm; }
        .th{ @apply sticky top-0 z-0 text-left px-3 py-2 border-b; }
        .td{ @apply px-3 py-2 border-b align-top; }
        .cell{ @apply w-full outline-none; }
        @media print{
          @page{ size:A4; margin:10mm }
          html, body{ background:#fff }
          #paper{ transform: scale(var(--print-scale,1)); transform-origin: top left; }
          #paper *{ line-height: var(--print-lh,1.35); letter-spacing: var(--print-ls, 0.01em); }
        }
      `}</style>

    </div>
  )
}

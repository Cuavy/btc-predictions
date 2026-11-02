const $ = id => document.getElementById(id);
const API = "/api/market";
let btc=null, market=null, book=null, candles=[], ticks=[], lastMarketFetch=0, lastTickAt=0, modelState=null;
const fmt=n=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const cents=p=>p==null||!Number.isFinite(p)?"—":`${Math.round(p*100)}¢`;
const pct=p=>p==null||!Number.isFinite(p)?"—":`${(p*100).toFixed(1)}%`;
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:null;};
const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&x!=="");
function epoch(v){if(v==null)return null;const n=Number(v);if(Number.isFinite(n))return n>1e12?n/1000:n;const d=Date.parse(v);return Number.isFinite(d)?d/1000:null;}
function normalizePrice(v){const n=num(v);return n==null?null:(n>1?n/100:n);}
function priceLevel(levels){if(!Array.isArray(levels)||!levels.length)return null;const vals=levels.map(x=>normalizePrice(Array.isArray(x)?x[0]:x.price)).filter(x=>x!==null);return vals.length?Math.max(...vals):null;}
function cdf(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));p=1-p;return x>=0?p:1-p;}
function getClose(m){return epoch(first(m.close_time,m.close_ts,m.expiration_time,m.end_ts,m.settlement_ts));}
function getStrike(m){return num(first(m.floor_strike_dollars,m.floor_strike,m.strike_price));}
function orderBook(raw){const ob=raw?.orderbook_fp||raw?.orderbook||raw;const yes=ob?.yes_dollars||ob?.yes||[],no=ob?.no_dollars||ob?.no||[];const yb=priceLevel(yes),nb=priceLevel(no);return{yesBid:yb,noBid:nb,yesAsk:nb==null?null:1-nb,noAsk:yb==null?null:1-yb};}
async function fetchJSON(url){const r=await fetch(url,{cache:"no-store"});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`API ${r.status}`);return body;}
async function loadMarket(){const data=await fetchJSON(`${API}?type=markets`),rows=data.markets||[],now=Date.now()/1000;const active=rows.filter(m=>{const close=getClose(m);return close&&close>now&&(m.status==="active"||m.status==="open"||!m.status);}).sort((a,b)=>getClose(a)-getClose(b));market=active[0]||null;if(!market)throw new Error("No currently open KXBTC15M market returned by Kalshi.");const strike=getStrike(market);$("market-title").textContent=market.title||market.subtitle||"Bitcoin 15-minute market";$("market-ticker").textContent=`Ticker: ${market.ticker||"—"}`;$("market-close").textContent=`Close: ${new Date(getClose(market)*1000).toLocaleTimeString()}`;$("strike").textContent=strike?fmt(strike):"Awaiting strike";$("market-status").textContent=market.status||"OPEN";$("detail-ticker").textContent=market.ticker||"—";$("detail-status").textContent=market.status||"OPEN";lastMarketFetch=Date.now();await loadBook();}
async function loadBook(){if(!market?.ticker)return;const data=await fetchJSON(`${API}?type=orderbook&ticker=${encodeURIComponent(market.ticker)}`);book=orderBook(data);$("yes-bid").textContent=cents(book.yesBid);$("yes-ask").textContent=cents(book.yesAsk);$("no-bid").textContent=cents(book.noBid);$("no-ask").textContent=cents(book.noAsk);$("book-time").textContent=`Updated ${new Date().toLocaleTimeString()}`;}
async function loadCandles(){const end=Math.floor(Date.now()/1000),start=end-5*3600;const data=await fetchJSON(`${API}?type=spotcandles&start=${start}&end=${end}`);candles=(Array.isArray(data)?data:[]).map(c=>({t:Number(c[0]),low:Number(c[1]),high:Number(c[2]),open:Number(c[3]),close:Number(c[4]),volume:Number(c[5])})).filter(c=>c.t&&c.close>0).sort((a,b)=>a.t-b.t);}
function priceAgo(ms){const target=Date.now()-ms;let found=null;for(const t of ticks){if(t.t<=target)found=t;else break;}return found?.p??null;}
function changeFrom(p){return p&&btc?btc/p-1:null;}
function onBtc(price){if(!Number.isFinite(price))return;btc=price;lastTickAt=Date.now();ticks.push({t:Date.now(),p:price});ticks=ticks.filter(t=>t.t>Date.now()-60*60*1000);$("btc-price").textContent=fmt(price);const prev=priceAgo(60*1000),c1=changeFrom(prev),c5=changeFrom(priceAgo(5*60*1000)),c15=changeFrom(priceAgo(15*60*1000));$("btc-change").textContent=c1==null?"Collecting 1-minute reference data":`${c1>=0?"+":""}${(c1*100).toFixed(3)}% over 1 minute`;
for(const [id,v] of [["btc-5m",c5],["btc-15m",c15]])$(id).textContent=v==null?"Collecting…":`${v>=0?"+":""}${(v*100).toFixed(3)}%`;
if(ticks.length){const ps=ticks.map(t=>t.p);$("btc-range").textContent=`${fmt(Math.max(...ps))} / ${fmt(Math.min(...ps))}`;}drawSpark();renderModel();}
function connectCoinbase(){const ws=new WebSocket("wss://ws-feed.exchange.coinbase.com");ws.onopen=()=>{ws.send(JSON.stringify({type:"subscribe",product_ids:["BTC-USD"],channels:["ticker"]}));$("connection").textContent="BTC FEED LIVE";$("feed-health").textContent="LIVE";};ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==="ticker"&&m.product_id==="BTC-USD")onBtc(num(m.price));}catch{}};ws.onerror=()=>{$("connection").textContent="FEED ISSUE";$("feed-health").textContent="ISSUE";};ws.onclose=()=>{$("connection").textContent="RECONNECTING";$("feed-health").textContent="RECONNECTING";setTimeout(connectCoinbase,2500);};}
function drawSpark(){const c=$("sparkline"),ctx=c.getContext("2d"),w=c.clientWidth||500,h=68,dpr=devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const arr=ticks.slice(-120).map(x=>x.p);if(arr.length<2)return;const lo=Math.min(...arr),hi=Math.max(...arr),range=hi-lo||1;ctx.beginPath();arr.forEach((v,i)=>{const x=i/(arr.length-1)*w,y=h-5-(v-lo)/range*(h-12);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=arr.at(-1)>=arr[0]?"#55e0a0":"#ff6e79";ctx.lineWidth=2;ctx.stroke();}
function getVol(){
  const closes=candles.map(c=>c.close).filter(x=>x>0);
  if(closes.length<61)return null;
  const rs=[];
  for(let i=1;i<closes.length;i++){
    const dt=(candles[i].t-candles[i-1].t)/60;
    if(dt>0&&dt<=2)rs.push(Math.log(closes[i]/closes[i-1])/Math.sqrt(dt));
  }
  if(rs.length<60)return null;
  const sorted=[...rs].sort((a,b)=>a-b);
  const lo=sorted[Math.floor(sorted.length*.05)],hi=sorted[Math.floor(sorted.length*.95)];
  const clipped=rs.map(x=>Math.max(lo,Math.min(hi,x)));
  const mean=clipped.reduce((a,b)=>a+b,0)/clipped.length;
  const variance=clipped.reduce((a,b)=>a+(b-mean)**2,0)/(clipped.length-1);
  const sigma=Math.sqrt(variance);
  if(!Number.isFinite(sigma)||sigma<=0)return null;
  return {sigma,count:rs.length};
}
let signalCandidate=null,signalSince=0;
function renderModel(){
  if(!btc||!market||!book)return;
  const strike=getStrike(market),close=getClose(market),remaining=Math.max(0,close-Date.now()/1000);
  if(!strike||!close){$("data-quality").textContent="Strike/time unavailable";return;}
  const volStats=getVol(),vol=volStats?.sigma;
  const one=changeFrom(priceAgo(60e3)),five=changeFrom(priceAgo(5*60e3)),fifteen=changeFrom(priceAgo(15*60e3));
  const sigma=vol;
  const remainingMinutes=remaining/60;
  const ready=!!(sigma&&volStats.count>=60&&one!=null&&five!=null&&Date.now()-lastTickAt<15000&&remaining>60&&remaining<=900);
  let pModel=null;
  if(ready){
    // Shrink the short-term drift heavily; cap it to avoid extrapolating a brief spike.
    const rawDrift=(0.60*(five/5)+0.25*one+0.15*(fifteen==null?0:fifteen/15))*0.15;
    const drift=Math.max(-sigma*.35,Math.min(sigma*.35,rawDrift));
    const z=(Math.log(btc/strike)+drift*remainingMinutes)/(sigma*Math.sqrt(remainingMinutes));
    pModel=Math.min(.995,Math.max(.005,cdf(z)));
  }
  const yesBid=book.yesBid,yesAsk=book.yesAsk,noBid=book.noBid,noAsk=book.noAsk;
  const yesMid=yesBid!=null&&yesAsk!=null?(yesBid+yesAsk)/2:(yesAsk??yesBid);
  const noMid=noBid!=null&&noAsk!=null?(noBid+noAsk)/2:(noAsk??noBid);
  const spread=yesBid!=null&&yesAsk!=null?yesAsk-yesBid:null;
  // Treat the live Kalshi midpoint as the anchor and shrink the experimental spot model toward it.
  // This deliberately prevents a noisy spot-only model from creating large apparent edges.
  const pYes=pModel==null?null:(yesMid==null?pModel:Math.min(.995,Math.max(.005,yesMid+0.50*(pModel-yesMid))));
  const noFair=pYes==null?null:1-pYes;
  const yesEdge=pYes==null||yesAsk==null?null:pYes-yesAsk;
  const noEdge=noFair==null||noAsk==null?null:noFair-noAsk;
  const distance=btc/strike-1;
  $("distance").textContent=`${distance>=0?"+":""}${(distance*100).toFixed(3)}%`;
  if(pYes==null){
    $("yes-prob").innerHTML="—";$("no-prob").innerHTML="—";
    $("yes-bar").style.width="0%";$("no-bar").style.width="0%";
    $("yes-edge").textContent="Model warming up";$("no-edge").textContent="Model warming up";
  }else{
    $("yes-prob").innerHTML=`${(pYes*100).toFixed(1)}<small>%</small>`;
    $("no-prob").innerHTML=`${(noFair*100).toFixed(1)}<small>%</small>`;
    $("yes-bar").style.width=`${pYes*100}%`;$("no-bar").style.width=`${noFair*100}%`;
    $("yes-edge").textContent=`vs ask: ${yesEdge==null?"—":`${yesEdge*100>=0?"+":""}${(yesEdge*100).toFixed(1)}¢`}`;
    $("no-edge").textContent=`vs ask: ${noEdge==null?"—":`${noEdge*100>=0?"+":""}${(noEdge*100).toFixed(1)}¢`}`;
  }
  $("yes-market-prob").textContent=pct(yesMid);$("no-market-prob").textContent=pct(noMid);
  $("distance-detail").textContent=$("distance").textContent;
  $("momentum").textContent=one==null?"Collecting…":`${one>=0?"+":""}${(one*100).toFixed(3)}%`;
  $("momentum-5m").textContent=five==null?"Collecting…":`${five>=0?"+":""}${(five*100).toFixed(3)}%`;
  $("momentum-15m").textContent=fifteen==null?"Collecting…":`${fifteen>=0?"+":""}${(fifteen*100).toFixed(3)}%`;
  $("volatility").textContent=volStats==null?"Need 60+ valid minute returns":`${(vol*100).toFixed(3)}% / √min · ${volStats.count} returns`;
  $("time-left").textContent=`${Math.floor(remaining/60)}m ${Math.floor(remaining%60)}s`;
  const spreadOk=spread!=null&&spread<=0.05;
  const qualityParts=[volStats!=null,one!=null,five!=null,spreadOk,Date.now()-lastTickAt<15000,remaining>60].filter(Boolean).length;
  const score=Math.round(qualityParts/6*100);
  $("data-quality").textContent=qualityParts>=5?"Good inputs":qualityParts>=3?"Partial inputs":"Limited inputs";
  $("compare-model").textContent=pModel==null?"—":pct(pModel);$("compare-mid").textContent=pct(yesMid);
  $("compare-spread").textContent=spread==null?"—":`${(spread*100).toFixed(1)}¢`;
  const bestEdge=Math.max(yesEdge??-1,noEdge??-1);
  $("compare-edge").textContent=bestEdge<0?"—":`${(bestEdge*100).toFixed(1)}¢`;
  $("confidence").textContent=`${score}/100 · data quality, not win probability`;
  // Require at least 10¢ estimated edge after a spread allowance, a tight book, fresh data,
  // sufficient volatility history, and 15 seconds of a persistent candidate signal.
  const requiredEdge=0.06+(spread==null?0.03:Math.max(0,spread)*0.5);
  let side="NONE",ask=null,fair=null,edge=null;
  if(ready&&spreadOk&&pYes!=null){
    if(yesEdge!=null&&yesEdge>=requiredEdge&&(noEdge==null||yesEdge>=noEdge)){side="YES";ask=yesAsk;fair=pYes;edge=yesEdge;}
    else if(noEdge!=null&&noEdge>=requiredEdge){side="NO";ask=noAsk;fair=noFair;edge=noEdge;}
  }
  const candidate=side==="NONE"?null:side;
  if(candidate!==signalCandidate){signalCandidate=candidate;signalSince=Date.now();}
  const stable=!!candidate&&Date.now()-signalSince>=15000;
  const valid=stable&&ask!=null&&remaining>60;
  const maxEntry=fair==null?null:Math.max(.01,fair-requiredEdge);
  const entry=valid?ask:null;
  const target=entry==null?null:Math.min(.99,entry+Math.min(.08,Math.max(.05,(fair-entry)*.5)));
  const stop=entry==null?null:Math.max(.01,entry-.06);
  $("entry-now").textContent=cents(ask);$("entry-max").textContent=cents(maxEntry);
  $("take-profit").textContent=cents(target);$("stop-loss").textContent=cents(stop);
  $("model-updated").textContent=`Updated ${new Date().toLocaleTimeString()}`;
  $("detail-refresh").textContent=new Date(lastMarketFetch).toLocaleTimeString();
  const badge=$("signal-badge");badge.className="signal-status";
  if(valid){badge.textContent=side==="YES"?"BUY YES · UP":"BUY NO · DOWN";badge.classList.add("buy");$("signal-title").textContent=side==="YES"?"Potential UP / YES entry":"Potential DOWN / NO entry";
    $("signal-reason").textContent=`Blended estimate ${pct(fair)} vs ${cents(ask)} ask; estimated edge ${(edge*100).toFixed(1)}¢. YES maps to UP and NO maps to DOWN only if this market’s contract wording confirms that direction. Signal persisted for 15 seconds; verify the contract and live quote.`;
  }else{
    badge.textContent="NO TRADE";$("signal-title").textContent=candidate?"Confirming signal stability…":"No qualifying entry right now";
    $("signal-reason").textContent=!ready?"Waiting for fresh BTC ticks and at least 60 valid one-minute volatility returns.":!spreadOk?"Order-book spread is too wide or unavailable.":candidate?"A candidate edge appeared, but it must remain valid for 15 seconds.":"No side clears the conservative edge threshold after spread allowance.";
  }
  $("signal-disclaimer").textContent="More conservative experimental filter—not a validated prediction system. Model probability is blended equally with the Kalshi midpoint, requires 6¢+ estimated edge plus spread allowance, tight spread, fresh data and 15-second signal persistence. Fees, slippage, queue position and settlement-source differences remain; no probability or price is guaranteed.";
  modelState={pYes,pModel,yesMid,noMid,score,ready,edge:bestEdge};
}
function countdown(){const close=getClose(market);if(!close){$("countdown").textContent="--:--";return;}const s=Math.max(0,Math.floor(close-Date.now()/1000));$("countdown").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;$("time-left").textContent=`${Math.floor(s/60)}m ${s%60}s`;$("clock").textContent=new Date().toLocaleTimeString([],{hour12:false})+" LOCAL";if(lastTickAt&&Date.now()-lastTickAt>15000){$("connection").textContent="BTC FEED STALE";$("feed-health").textContent="STALE";}}
function renderHistory(markets){const rows=$("history-rows");rows.innerHTML="";let yes=0,no=0;const settled=markets.filter(m=>m.result==="yes"||m.result==="no");settled.forEach(m=>m.result==="yes"?yes++:no++);$("history-count").textContent=settled.length;$("history-yes").textContent=yes;$("history-no").textContent=no;$("history-status").textContent=settled.length?"LIVE DATA":"No results";if(!settled.length){rows.innerHTML='<tr><td colspan="5" class="empty">No settled BTC 15-minute results were returned. Try refreshing later.</td></tr>';return;}settled.slice(0,20).forEach(m=>{const tr=document.createElement("tr"),close=getClose(m),result=m.result.toUpperCase(),vals=[m.title||m.ticker||"BTC 15m",close?new Date(close*1000).toLocaleString():"—",result,m.settlement_value_dollars?fmt(m.settlement_value_dollars):(m.last_price_dollars?cents(Number(m.last_price_dollars)):"—"),m.volume_fp??m.volume??"—"];vals.forEach((v,i)=>{const td=document.createElement("td");td.textContent=v;if(i===2)td.className=result==="YES"?"positive":"negative";tr.appendChild(td);});rows.appendChild(tr);});}
async function loadHistory(){$("history-status").textContent="Loading…";try{const data=await fetchJSON(`${API}?type=history`);renderHistory(data.markets||[]);}catch(e){$("history-status").textContent="Unavailable";$("history-rows").innerHTML=`<tr><td colspan="5" class="empty">Could not load results: ${e.message}</td></tr>`;}}
function readTrades(){try{return JSON.parse(localStorage.getItem("btcsc-trades")||"[]");}catch{return[];}}
function saveTrades(a){localStorage.setItem("btcsc-trades",JSON.stringify(a));renderTrades();}
function renderTrades(){const rows=readTrades(),body=$("trade-rows");body.innerHTML="";let pnl=0,wins=0;rows.forEach((t,i)=>{const diff=(t.side==="YES"?t.exit-t.entry:t.entry-t.exit)*t.qty/100;pnl+=diff;if(diff>0)wins++;const tr=document.createElement("tr"),vals=[new Date(t.time).toLocaleString(),t.side,`${t.entry}¢`,`${t.exit}¢`,t.qty,`${diff>=0?"+":""}$${diff.toFixed(2)}`];vals.forEach((v,j)=>{const td=document.createElement("td");td.textContent=v;if(j===5)td.className=diff>=0?"positive":"negative";tr.appendChild(td);});const td=document.createElement("td"),btn=document.createElement("button");btn.textContent="×";btn.title="Delete trade";btn.onclick=()=>{const a=readTrades();a.splice(i,1);saveTrades(a);};td.appendChild(btn);tr.appendChild(td);body.appendChild(tr);});if(!rows.length)body.innerHTML='<tr><td colspan="7" class="empty">No trades logged yet. Record a closed trade above.</td></tr>';$('stat-count').textContent=rows.length;$('stat-winrate').textContent=rows.length?`${(wins/rows.length*100).toFixed(1)}%`:"—";$('stat-pnl').textContent=`${pnl>=0?"+":""}$${pnl.toFixed(2)}`;$('stat-pnl').style.color=pnl>=0?"var(--green)":"var(--red)";$('stat-avg').textContent=rows.length?`${pnl/rows.length>=0?"+":""}$${(pnl/rows.length).toFixed(2)}`:"$0.00";}
$("trade-form").addEventListener("submit",e=>{e.preventDefault();const side=$("trade-side").value,entry=Number($("trade-entry").value),exit=Number($("trade-exit").value),qty=Number($("trade-size").value);if(entry<1||entry>99||exit<1||exit>99||qty<1)return;const a=readTrades();a.unshift({side,entry,exit,qty,time:Date.now()});saveTrades(a);$("trade-form").reset();$("trade-size").value=1;});
async function refreshAll(){try{await loadMarket();await loadCandles();renderModel();}catch(e){$("market-title").textContent=e.message;$("market-status").textContent="DATA ISSUE";}}
async function init(){connectCoinbase();renderTrades();await Promise.allSettled([refreshAll(),loadHistory()]);setInterval(async()=>{try{if(!market||Date.now()-lastMarketFetch>15000||getClose(market)<Date.now()/1000){await refreshAll();}else{await loadBook();renderModel();}}catch(e){$("connection").textContent="API RETRY";}},5000);setInterval(countdown,250);setInterval(()=>loadHistory(),60000);$("refresh").onclick=refreshAll;$("history-refresh").onclick=loadHistory;}
init();

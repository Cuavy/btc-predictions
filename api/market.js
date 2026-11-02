// Read-only public market-data proxy for Kalshi and Coinbase. No trading endpoints.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const { type, ticker, start, end } = req.query || {};
  const kalshi = "https://external-api.kalshi.com/trade-api/v2";
  try {
    if (type === "markets") {
      const r = await fetch(`${kalshi}/markets?series_ticker=KXBTC15M&status=open&limit=100`);
      return res.status(r.status).json(await r.json());
    }
    if (type === "orderbook" && ticker) {
      const r = await fetch(`${kalshi}/markets/${encodeURIComponent(ticker)}/orderbook`);
      return res.status(r.status).json(await r.json());
    }
    if (type === "history") {
      // Recent settled markets plus older markets moved to Kalshi's historical tier.
      const urls = [
        `${kalshi}/markets?series_ticker=KXBTC15M&status=settled&limit=100`,
        `${kalshi}/historical/markets?series_ticker=KXBTC15M&limit=100`
      ];
      const responses = await Promise.allSettled(urls.map(u => fetch(u)));
      const combined = [];
      for (const item of responses) {
        if (item.status !== "fulfilled" || !item.value.ok) continue;
        const body = await item.value.json();
        combined.push(...(body.markets || []));
      }
      const unique = [...new Map(combined.map(m => [m.ticker, m])).values()];
      const stamp = m => { const v = m.settlement_ts || m.close_time || 0; const n = Number(v); return Number.isFinite(n) && n > 0 ? (n > 1e12 ? n/1000 : n) : (Date.parse(v) || 0) / 1000; };
      unique.sort((a,b) => stamp(b) - stamp(a));
      return res.status(200).json({ markets: unique.slice(0, 100) });
    }
    if (type === "spotcandles" && start && end) {
      const url = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${encodeURIComponent(new Date(Number(start)*1000).toISOString())}&end=${encodeURIComponent(new Date(Number(end)*1000).toISOString())}`;
      const r = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "BTC-Signal-Center/2.0" } });
      return res.status(r.status).json(await r.json());
    }
    return res.status(400).json({ error: "Invalid request. Use markets, orderbook, history or spotcandles." });
  } catch (err) {
    return res.status(502).json({ error: "Upstream data request failed", detail: String(err) });
  }
}

# BTC Signal Center — Kalshi 15-minute dashboard

Read-only website for monitoring Coinbase BTC-USD and Kalshi KXBTC15M markets. It does not place trades and requires no Kalshi credentials.

## Features
- Coinbase BTC-USD live WebSocket reference price, sparkline, 1m/5m/15m momentum, session range.
- Current KXBTC15M market and public order book snapshot.
- Experimental YES/NO model probabilities, market midpoint comparison, estimated edge, spread, and heuristic input-quality score.
- Recent settled BTC 15-minute market outcomes from Kalshi live and historical market endpoints.
- Manual trade journal with browser-local win rate and P/L.

## Deploy
Import this folder into Vercel as an `Other` project. Keep the root directory `./`; leave build, output, and install commands blank. The `api/market.js` serverless function is required. No environment variables are needed.

## Important limitations
- The probability model is experimental and uncalibrated. Its quality score is a data-quality heuristic, not the chance a trade wins.
- Coinbase BTC-USD is a spot reference and may differ from the price/index used by Kalshi settlement rules.
- The 4-cent edge buffer, 10-cent take-profit, and 8-cent stop-loss are illustrative placeholders, not optimized trading parameters or verified fee calculations.
- P/L excludes fees, spread, slippage and taxes. Journal data is stored in the current browser's local storage only.
- Market data can be delayed or temporarily unavailable. Historical settled market availability is controlled by Kalshi's API retention tiers.
- No order placement, account access, or automated trading is included.


## Directional-balance update

The signal model now blends the experimental spot probability 50/50 with the Kalshi midpoint (previously weighted much more heavily toward the midpoint) and uses a symmetric YES/NO edge test with a lower 6¢ minimum estimated edge plus spread allowance. YES/NO are contract outcomes; verify the exact market wording and settlement reference. This remains experimental and is not a calibrated or guaranteed prediction system.

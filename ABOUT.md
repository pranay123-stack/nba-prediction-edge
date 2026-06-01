# About NBA Prediction Edge

## What This Is

NBA Prediction Edge is an automated trading bot for NBA Playoffs prediction markets on Polymarket. It uses a **hybrid multi-signal strategy** that combines real-time injury intelligence with cross-market momentum analysis to find and execute on mispriced positions before the market corrects.

This project was built for the [DEGA NBA Playoffs Prediction Market Hackathon](https://dorahacks.io/hackathon/nba-prediction-market) on DoraHacks, using Canon CLI as the automation framework.

---

## The Automation Flow

### Step 1: Data Fetch (parallel)

The bot simultaneously pulls data from two sources every 15 seconds:

- **Polymarket Gamma API** — Fetches all active NBA Playoffs markets, including current YES/NO prices, volume, and liquidity. Each market is parsed into a typed `ParsedMarket` object and appended to a rolling price history for momentum tracking.

- **ESPN Injury Page** — Scrapes the ESPN NBA injuries page using Cheerio. Each injury report is compared against the bot's internal cache of previously seen reports. If a player's status *changed* (e.g., from QUESTIONABLE to OUT), it's flagged as `isNew: true` — this is the key signal that the market hasn't priced it in yet.

### Step 2: Signal Detection

Two independent signal detectors run against the fetched data:

- **Injury Alpha Signal** — For each new/changed injury report, the detector estimates the price impact using a player-specific weight table (star players like SGA or Jokic have 15-18% impact; role players ~4%) multiplied by a status severity factor (OUT = 1.0×, QUESTIONABLE = 0.35×). It then finds all Polymarket markets mentioning the affected team and creates a typed `InjurySignal`.

- **Momentum Lag Signal** — Compares each market's current price against its price history within the configured window (default 30s). When a market moves ≥2¢, the detector searches for *correlated markets* (same team/series keywords) that haven't moved yet. These lagged markets are the opportunity — the expected correction is estimated at 60% of the leader's move.

### Step 3: EV Calculation

For every signal, the EV Calculator estimates the "true" probability by adjusting the market price by the signal's estimated impact, discounted by confidence. It then computes:

- **Edge** = our estimated true probability − current market price
- **Kelly Fraction** = half-Kelly sizing for downside protection
- **Position Size** = Kelly × bankroll, capped at `MAX_POSITION_SIZE_USD`
- **Expected Profit** = edge × position size

Signals with edge below `MIN_EDGE_THRESHOLD` (default 3%) are discarded — they can't overcome fees and slippage.

### Step 4: Decision

The Decision Engine converts EV calculations into concrete `BUY_YES`, `BUY_NO`, or `SKIP` actions. It enforces a cooldown period per market (default 60s) to prevent re-entering the same position too quickly. Each decision is logged with its full reasoning chain.

### Step 5: Execution

Before execution, the Risk Manager runs pre-trade checks:
- Position size within limits
- Daily P&L above the loss limit
- Win rate above the minimum threshold (checked after 10+ trades)

If all checks pass, the Executor simulates the trade with realistic latency (50-200ms) and slippage (0.1-1.5%) modeling. It generates a fake transaction hash for the logs. In live mode, this would submit a limit order via Polymarket's CLOB API.

### Step 6: Logging & Metrics

Every step writes a structured JSON entry to `.canon/execution/run-{datetime}.json`. At shutdown, the bot prints a summary with:
- Total trades, win rate, total P&L, average edge per trade
- Whether the bot was auto-paused by the risk manager

---

## What Makes This Innovative

### Beyond Default Templates

Canon's built-in templates cover basic arbitrage, simple momentum, and single-source analysis. NBA Prediction Edge goes further:

1. **Multi-source signal fusion** — Instead of relying on one signal type, it combines injury intelligence with market microstructure analysis. A single injury report can trigger *both* an injury alpha signal *and* a momentum lag signal across correlated markets.

2. **Player-specific impact modeling** — Not all injuries are equal. The bot maintains a weighted table of star players and their estimated impact on series outcomes. SGA going OUT for OKC is worth 18% on the series line; a bench player is worth 4%.

3. **Speed as alpha** — The bot polls injury sources every 15 seconds and detects when a market *hasn't yet* moved. The window between news breaking and full market repricing is where the edge lives.

4. **Adaptive risk management** — The bot doesn't blindly trade. If its win rate drops below threshold, it pauses itself and logs a warning. This prevents runaway losses during regime changes.

### Why This Has Real-World Utility

- **Injury-driven mispricing is real** — In traditional sports betting, injury news moves lines within seconds. Prediction markets are slower to reprice, especially for correlated markets (game vs. series vs. conference).

- **Cross-market lag is structural** — Polymarket lists separate markets for individual games, series winners, and conference champions. Liquidity providers don't simultaneously update all correlated markets, creating exploitable lag.

- **Configurable and safe** — Every parameter is environment-variable controlled. Dry-run mode lets users validate the strategy without risking capital. Risk limits prevent catastrophic losses.

---

## Technical Highlights

- **Fully typed TypeScript** — Every data structure from market prices to trade results is defined in `src/types.ts` with strict typing
- **Modular architecture** — Clean separation: data fetchers, strategy logic, execution, and utilities in dedicated folders
- **Parallel data fetching** — Injury scraping and market data fetching run concurrently with `Promise.all`
- **Graceful degradation** — If ESPN is down, the bot continues with market-only signals. Retry logic with exponential backoff on all external calls
- **Structured execution logs** — Every pipeline phase writes JSON logs for auditability and debugging
- **Comprehensive tests** — Jest unit tests covering signal detection, EV calculation, and risk management

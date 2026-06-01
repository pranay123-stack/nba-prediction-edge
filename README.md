# NBA Prediction Edge

**Multi-signal NBA Playoffs prediction market automation** — combines injury-driven alpha with cross-market momentum lag detection to find mispriced Polymarket positions before the market corrects.

Built with [Canon CLI](https://dorahacks.io/hackathon/nba-prediction-market) by DEGA for the NBA Playoffs Prediction Market Hackathon on DoraHacks.

---

## The Strategy

Most prediction market bots use a single signal: either pure arbitrage, simple momentum following, or news sentiment. **NBA Prediction Edge** is different — it fuses three signals into one decision pipeline:

1. **Injury Alpha** — Scrapes real-time NBA injury reports from ESPN. When a star player's status changes (e.g., SGA ruled OUT), the bot detects the update *before* Polymarket odds fully reprice. The price impact model weights each player by their historical influence on series outcomes.

2. **Momentum Lag** — Monitors multiple correlated NBA markets simultaneously. When one market moves (e.g., "OKC wins Game 6" drops 7¢), the bot identifies related markets that haven't adjusted yet (e.g., "OKC wins Finals") and targets the lag.

3. **Speed Execution** — When signals fire, the bot calculates expected value using a half-Kelly criterion, checks all risk limits, and simulates order placement with realistic slippage modeling — all within milliseconds.

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/pranay-hft/nba-prediction-edge.git
cd nba-prediction-edge
npm install
```

### Configuration

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

**Environment Variables:**

| Variable | Default | Description |
|---|---|---|
| `DRY_RUN` | `true` | Set to `false` for live trading (requires wallet) |
| `POLYMARKET_API_URL` | `https://gamma-api.polymarket.com` | Polymarket Gamma API base URL |
| `POLYMARKET_CLOB_URL` | `https://clob.polymarket.com` | Polymarket CLOB API for order execution |
| `POLYGON_RPC_URL` | `https://polygon-rpc.com` | Polygon RPC endpoint |
| `PRIVATE_KEY` | *(empty)* | Wallet private key (live mode only) |
| `MAX_POSITION_SIZE_USD` | `50` | Maximum single trade size in USD |
| `STOP_LOSS_THRESHOLD` | `0.15` | Stop loss as fraction of position |
| `DAILY_LOSS_LIMIT_USD` | `200` | Daily loss limit — bot pauses when hit |
| `MIN_WIN_RATE_THRESHOLD` | `0.52` | Win rate below this triggers auto-pause |
| `MIN_EDGE_THRESHOLD` | `0.03` | Minimum edge (3%) to trigger a trade |
| `MOMENTUM_LAG_WINDOW_MS` | `30000` | Window for detecting price momentum |
| `INJURY_POLL_INTERVAL_MS` | `15000` | How often to check for injury updates |
| `SIGNAL_COOLDOWN_MS` | `60000` | Cooldown before re-entering same market |

### Run

```bash
# Start with Canon
npm run canon:start

# Or directly
npm start

# Run tests
npm test

# Type check
npm run lint
```

---

## Project Structure

```
nba-prediction-edge/
├── canon.config.json          # Canon strategy configuration
├── package.json
├── tsconfig.json
├── jest.config.js
├── .env.example               # Environment variable template
├── .gitignore
├── src/
│   ├── index.ts               # Main entry point & pipeline loop
│   ├── types.ts               # Shared TypeScript interfaces
│   ├── data/
│   │   ├── polymarket-client.ts  # Polymarket Gamma API client
│   │   └── injury-scraper.ts     # ESPN injury report scraper
│   ├── strategy/
│   │   ├── signal-detector.ts    # Injury & momentum signal detection
│   │   ├── ev-calculator.ts      # Expected value & Kelly sizing
│   │   ├── decision-engine.ts    # Trade decision logic
│   │   └── risk-manager.ts       # Position limits & circuit breakers
│   ├── execution/
│   │   └── executor.ts           # Dry-run / live order execution
│   └── utils/
│       ├── config.ts             # Environment variable loader
│       ├── logger.ts             # Winston logger + JSON execution logs
│       └── retry.ts              # Exponential backoff retry wrapper
├── tests/
│   ├── signal-detector.test.ts   # Signal detection unit tests
│   ├── ev-calculator.test.ts     # EV calculation unit tests
│   └── risk-manager.test.ts      # Risk management unit tests
├── .canon/
│   └── execution/
│       └── sample-run.json       # Example dry-run execution log
├── README.md
├── ABOUT.md
└── DEMO_SCRIPT.md
```

---

## How It Works

```
┌─────────────┐    ┌─────────────┐
│  ESPN Injury │    │  Polymarket │
│   Scraper    │    │  Gamma API  │
└──────┬───────┘    └──────┬──────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│       Signal Detector            │
│  • Injury Alpha (new/changed)    │
│  • Momentum Lag (cross-market)   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│       EV Calculator              │
│  • True prob estimate            │
│  • Half-Kelly position sizing    │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│       Decision Engine            │
│  • BUY YES / BUY NO / SKIP      │
│  • Cooldown enforcement          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│       Risk Manager               │
│  • Max position check            │
│  • Daily loss limit              │
│  • Win rate circuit breaker      │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│       Executor                   │
│  • Dry-run simulation            │
│  • Slippage + latency modeling   │
│  • Structured JSON logging       │
└──────────────────────────────────┘
```

---

## Execution Logs

Every pipeline step logs structured JSON to `.canon/execution/`:

```json
{
  "timestamp": "2026-06-01T14:00:03.012Z",
  "phase": "SIGNAL_DETECTION",
  "signal": "injury-alpha",
  "action": "new_injury_detected",
  "result": {
    "player": "Shai Gilgeous-Alexander",
    "team": "OKC",
    "status": "DOUBTFUL",
    "impactEstimate": 0.135,
    "confidence": 0.75,
    "affectedMarketCount": 4
  }
}
```

See [`.canon/execution/sample-run.json`](.canon/execution/sample-run.json) for a complete dry-run example.

---

## Testing

```bash
npm test              # Run all unit tests
npm run test:coverage # With coverage report
```

Tests cover:
- Signal detection: star vs. role player impact, status severity ordering, team matching
- EV calculation: edge thresholds, Kelly sizing, position capping
- Risk management: daily loss limits, win rate circuit breakers, state resets

---

## License

MIT

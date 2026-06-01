# NBA Prediction Edge

### Multi-Signal NBA Playoffs Prediction Market Automation

> Combines real-time injury intelligence, cross-market momentum lag detection, and speed-based execution to find and exploit mispriced Polymarket positions before the market corrects.

Built with [Canon CLI](https://dorahacks.io/hackathon/nba-prediction-market) by **DEGA** for the **NBA Playoffs Prediction Market Hackathon** on DoraHacks.

| | |
|---|---|
| **Market** | [Polymarket](https://polymarket.com) (Polygon blockchain, USDC settlement) |
| **Strategy** | Hybrid multi-signal: Injury Alpha + Momentum Lag + Speed Execution |
| **Mode** | Dry-run simulation (default) or live trading |
| **Language** | TypeScript (strict mode) |
| **Tests** | 18 unit tests across 3 suites (Jest) |
| **Logging** | Structured JSON execution logs in `.canon/execution/` |

---

## Table of Contents

- [Why This Strategy Wins](#why-this-strategy-wins)
- [The Three Signals Explained](#the-three-signals-explained)
- [Architecture & Data Flow](#architecture--data-flow)
- [Pipeline Deep Dive (Step by Step)](#pipeline-deep-dive-step-by-step)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Execution Logs](#execution-logs)
- [Risk Management System](#risk-management-system)
- [Testing](#testing)
- [Live Run Output](#live-run-output)
- [Tech Stack](#tech-stack)

---

## Why This Strategy Wins

Most prediction market bots use **one signal** — basic arbitrage, simple momentum following, or news sentiment. They compete on a single dimension and get crowded out.

**NBA Prediction Edge is different.** It fuses **three independent signals** into one decision pipeline, creating an edge that no single-signal bot can replicate:

```
 Traditional Bot                    NBA Prediction Edge
 ┌──────────────┐                   ┌──────────────┐
 │  One Signal  │                   │  Signal 1    │──┐
 │  (e.g. arb)  │                   │  Injury Alpha│  │
 └──────┬───────┘                   └──────────────┘  │
        │                           ┌──────────────┐  │   ┌──────────────┐
        ▼                           │  Signal 2    │──┼──▶│  FUSED       │──▶ TRADE
    One trade                       │  Momentum Lag│  │   │  DECISION    │
   one dimension                    └──────────────┘  │   └──────────────┘
                                    ┌──────────────┐  │
                                    │  Signal 3    │──┘
                                    │  Speed Edge  │
                                    └──────────────┘
```

The result: **higher confidence trades**, **better sizing**, and **structural alpha** that persists because the edge comes from information asymmetry (injury news) and market microstructure (cross-market lag) — not just speed.

---

## The Three Signals Explained

### Signal 1: Injury Alpha

```
ESPN Injury Page                    Polymarket
──────────────────                  ──────────────────
SGA: Questionable → OUT             "OKC wins Finals?"
         │                           Price: 62¢
         │                           (hasn't moved yet)
         ▼                                │
   Bot detects change                     │
   within 15 seconds                      ▼
         │                          True value: ~49¢
         ▼                          (SGA impact: 18%)
   ┌─────────────┐                        │
   │ TRADE: BUY  │◀───────── EDGE ────────┘
   │ NO @ 38¢    │         (13¢ mispricing)
   └─────────────┘
```

**How it works:**
- Scrapes ESPN's NBA injury page every **15 seconds** using Cheerio
- Compares each report against an internal cache of previously seen statuses
- If a player's status **changed** (e.g., QUESTIONABLE → OUT), flags it as `isNew: true`
- Estimates price impact using a **player-specific weight table**:

| Player | Impact Weight | Rationale |
|---|---|---|
| Shai Gilgeous-Alexander | 18% | MVP candidate, OKC's entire offense |
| Nikola Jokic | 17% | Three-time MVP, irreplaceable |
| Giannis Antetokounmpo | 17% | Two-way dominance |
| Luka Doncic | 16% | Elite playmaker, high usage |
| Jalen Brunson | 15% | Knicks' primary scorer |
| Stephen Curry | 15% | Gravity and shooting |
| Role players | 4% | Limited series impact |

Impact is then multiplied by **status severity**:

| Status | Multiplier | Meaning |
|---|---|---|
| OUT | 1.0x | Definite absence — full impact |
| DOUBTFUL | 0.75x | Likely out — high impact |
| QUESTIONABLE | 0.35x | Uncertain — partial impact |
| PROBABLE | 0.1x | Likely playing — minimal |
| UPGRADED | -0.3x | Returning — positive for team |

**Why this is alpha:** Traditional sportsbooks reprice injury news in seconds. Prediction markets are slower — especially across correlated markets (game vs. series vs. conference). The window is small but real.

---

### Signal 2: Momentum Lag Detection

```
 Market A (moved)                 Market B (lagged)
 "OKC wins Game 6?"              "OKC wins Finals?"
                                  
 Price: 65¢ → 58¢                Price: 71¢ → 71¢
       (-7¢ in 30s)                    (no change!)
        │                                │
        │    ┌──────────────────┐         │
        └───▶│ LAG DETECTED!    │◀────────┘
             │ Expected move:   │
             │ -4.2¢ on Mkt B   │
             │ (60% of leader)  │
             └────────┬─────────┘
                      │
                      ▼
              ┌───────────────┐
              │ BUY NO @ 29¢  │
              │ on Market B   │
              └───────────────┘
```

**How it works:**
- Stores a rolling **price history** (last 20 snapshots) for every market
- Each cycle, compares current price vs. price from the momentum window (default 30s)
- When a market moves **≥ 2¢**, searches for **correlated markets** that haven't moved
- Correlation is detected via **keyword overlap** in market questions (same team, series, etc.)
- Expected correction = **60% of the leader's move** (empirical dampening factor)

**Why this is structural:** Polymarket lists separate markets for individual games, series winners, and conference champions. Liquidity providers don't simultaneously update all correlated markets. This creates a **predictable lag** that can be exploited.

---

### Signal 3: Speed Execution

```
 ┌─────────────────────────────────────────────────────┐
 │                 EXECUTION TIMELINE                   │
 │                                                      │
 │  T+0ms      T+15ms     T+50ms      T+200ms          │
 │    │          │           │            │              │
 │    ▼          ▼           ▼            ▼              │
 │  Signal    EV Calc    Decision     Execution         │
 │  fires     + Kelly    BUY/SKIP    (simulated)        │
 │                                                      │
 │  ◀────────── Under 200ms total ──────────▶          │
 │                                                      │
 │  Meanwhile, the market takes 5-30 minutes            │
 │  to fully reprice after injury news...               │
 └─────────────────────────────────────────────────────┘
```

The bot's pipeline — from signal detection to order placement — runs in **under 200ms**. This matters because prediction markets take **minutes** to fully reprice after news breaks.

---

## Architecture & Data Flow

### High-Level System Architecture

```
╔══════════════════════════════════════════════════════════════════════════╗
║                     NBA PREDICTION EDGE                                 ║
║                     System Architecture                                 ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  ┌─────────────────────── DATA LAYER ──────────────────────┐           ║
║  │                                                          │           ║
║  │  ┌──────────────────┐       ┌──────────────────┐        │           ║
║  │  │  ESPN Injury      │       │  Polymarket       │        │           ║
║  │  │  Scraper          │       │  Gamma API Client │        │           ║
║  │  │                   │       │                   │        │           ║
║  │  │  • Cheerio HTML   │       │  • REST client    │        │           ║
║  │  │    parsing        │       │  • Price history  │        │           ║
║  │  │  • Status change  │       │    tracking       │        │           ║
║  │  │    detection      │       │  • Market parsing │        │           ║
║  │  │  • Team name      │       │  • NBA filtering  │        │           ║
║  │  │    normalization  │       │    (keyword-based) │        │           ║
║  │  └────────┬─────────┘       └────────┬─────────┘        │           ║
║  │           │                          │                   │           ║
║  └───────────┼──────────────────────────┼───────────────────┘           ║
║              │    Promise.all()         │                               ║
║              │    (parallel fetch)      │                               ║
║              ▼                          ▼                               ║
║  ┌─────────────────────── STRATEGY LAYER ──────────────────┐           ║
║  │                                                          │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │              Signal Detector                      │   │           ║
║  │  │                                                   │   │           ║
║  │  │  Injury Alpha:          Momentum Lag:             │   │           ║
║  │  │  • New/changed status   • Price movement scan     │   │           ║
║  │  │  • Player impact model  • Cross-market correlation│   │           ║
║  │  │  • Confidence scoring   • Lag identification      │   │           ║
║  │  └─────────────────────┬────────────────────────────┘   │           ║
║  │                        │                                 │           ║
║  │                        ▼                                 │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │              EV Calculator                        │   │           ║
║  │  │                                                   │   │           ║
║  │  │  • True probability estimation                    │   │           ║
║  │  │  • Edge = true_prob - market_price                │   │           ║
║  │  │  • Half-Kelly position sizing (f = (bp-q)/2b)     │   │           ║
║  │  │  • Position size clamping to MAX_POSITION_SIZE    │   │           ║
║  │  └─────────────────────┬────────────────────────────┘   │           ║
║  │                        │                                 │           ║
║  │                        ▼                                 │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │              Decision Engine                      │   │           ║
║  │  │                                                   │   │           ║
║  │  │  • Positive edge → BUY YES                        │   │           ║
║  │  │  • Negative edge → BUY NO                         │   │           ║
║  │  │  • Below threshold → SKIP                         │   │           ║
║  │  │  • Per-market cooldown enforcement                │   │           ║
║  │  └─────────────────────┬────────────────────────────┘   │           ║
║  │                        │                                 │           ║
║  └────────────────────────┼─────────────────────────────────┘           ║
║                           │                                             ║
║  ┌────────────────────────┼──── EXECUTION LAYER ───────────┐           ║
║  │                        ▼                                 │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │              Risk Manager                         │   │           ║
║  │  │                                                   │   │           ║
║  │  │  Gate 1: Position size ≤ MAX_POSITION_SIZE_USD    │   │           ║
║  │  │  Gate 2: Daily P&L > -DAILY_LOSS_LIMIT_USD       │   │           ║
║  │  │  Gate 3: Win rate ≥ MIN_WIN_RATE_THRESHOLD        │   │           ║
║  │  │  Gate 4: Bot not paused                           │   │           ║
║  │  │                                                   │   │           ║
║  │  │  ANY gate fails → BLOCK trade + log reason        │   │           ║
║  │  └─────────────────────┬────────────────────────────┘   │           ║
║  │                        │                                 │           ║
║  │                        ▼                                 │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │              Executor                             │   │           ║
║  │  │                                                   │   │           ║
║  │  │  DRY-RUN MODE:           LIVE MODE:               │   │           ║
║  │  │  • Simulated latency     • Polymarket CLOB API    │   │           ║
║  │  │    (50-200ms)            • Signed limit orders    │   │           ║
║  │  │  • Simulated slippage    • Real tx hashes         │   │           ║
║  │  │    (0.1%-1.5%)                                    │   │           ║
║  │  │  • Fake tx hash                                   │   │           ║
║  │  └─────────────────────┬────────────────────────────┘   │           ║
║  │                        │                                 │           ║
║  └────────────────────────┼─────────────────────────────────┘           ║
║                           │                                             ║
║  ┌────────────────────────┼──── LOGGING LAYER ─────────────┐           ║
║  │                        ▼                                 │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │  Structured JSON Logs (.canon/execution/)         │   │           ║
║  │  │                                                   │   │           ║
║  │  │  Every phase writes: { timestamp, phase,          │   │           ║
║  │  │    signal, action, result }                       │   │           ║
║  │  │                                                   │   │           ║
║  │  │  Phases logged:                                   │   │           ║
║  │  │  DATA_FETCH → SIGNAL_DETECTION → EV_CALCULATION   │   │           ║
║  │  │  → DECISION → RISK_CHECK → EXECUTION              │   │           ║
║  │  └──────────────────────────────────────────────────┘   │           ║
║  │                                                          │           ║
║  │  ┌──────────────────────────────────────────────────┐   │           ║
║  │  │  Console Output (Winston)                         │   │           ║
║  │  │  [timestamp] [LEVEL] Human-readable messages      │   │           ║
║  │  └──────────────────────────────────────────────────┘   │           ║
║  │                                                          │           ║
║  └──────────────────────────────────────────────────────────┘           ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## Pipeline Deep Dive (Step by Step)

### Step 1 — Data Fetch (Parallel)

```
                    ┌──────────────────┐
    ┌──────────────▶│  Polymarket API   │
    │               │  (Gamma REST)     │
    │               │                   │
    │               │  GET /events      │
    │               │  ?active=true     │
    │               │  &closed=false    │
    │               │  &limit=100       │
    │               │  &order=volume24hr│
    │               └────────┬─────────┘
    │                        │
    │  Promise.all()         │ Filter: NBA keywords
    │  (runs both            │ (thunder, knicks, celtics,
    │   in parallel)         │  nba, finals, playoffs...)
    │                        │
    │                        ▼
    │               ┌──────────────────┐
    │               │  438 NBA Markets  │
    │               │                   │
    │               │  Each parsed to:  │
    │               │  {                │
    │               │    id,            │
    │               │    question,      │
    │               │    yesPrice,      │ ← numeric (0-1)
    │               │    noPrice,       │
    │               │    volume,        │
    │               │    liquidity,     │
    │               │    active         │
    │               │  }                │
    │               └──────────────────┘
    │
┌───┴───┐
│ index │           ┌──────────────────┐
│ .ts   │──────────▶│  ESPN Injuries   │
│       │           │  (HTML scrape)   │
│ main  │           │                  │
│ loop  │           │  Cheerio parse   │
└───────┘           │  each <tr>:      │
                    │  player, status,  │
                    │  team, reason     │
                    └────────┬─────────┘
                             │
                             │ Compare vs cache:
                             │ isNew = status changed?
                             │
                             ▼
                    ┌──────────────────┐
                    │  InjuryReport[]   │
                    │                   │
                    │  { playerName,    │
                    │    team: "OKC",   │
                    │    status: "OUT", │
                    │    isNew: true }  │ ← KEY FIELD
                    └──────────────────┘
```

**Key detail:** The `isNew` flag is what separates this from a basic scraper. We don't care about injuries that are already known — we only care about **changes** that haven't been priced in yet.

---

### Step 2 — Signal Detection

```
 INJURY ALPHA SIGNAL                    MOMENTUM LAG SIGNAL
 ═══════════════════                    ════════════════════

 Input: InjuryReport[]                  Input: ParsedMarket[]
        + ParsedMarket[]                       + Price History

        │                                      │
        ▼                                      ▼
 Filter: isNew == true                  Scan all markets:
        │                               current vs. history
        ▼                               (within 30s window)
 For each new injury:                          │
        │                                      ▼
        ▼                               Find markets that
 Look up player weight:                 moved ≥ 2¢:
 SGA → 0.18                            "OKC Game 6" -7¢
 Role player → 0.04                            │
        │                                      ▼
        ▼                               Find CORRELATED markets
 Multiply by status:                    that DIDN'T move:
 OUT → 1.0x                            (keyword overlap ≥ 2)
 DOUBTFUL → 0.75x                      "OKC Finals" → 0¢ change
 QUESTIONABLE → 0.35x                         │
        │                                      ▼
        ▼                               Expected correction:
 Impact = 0.18 × 1.0                    60% of leader move
        = 0.18 (18%)                    = -7¢ × 0.6 = -4.2¢
        │                                      │
        ▼                                      ▼
 Find affected markets:                 Confidence:
 question contains                      0.5 + |deltaPercent|
 "OKC" or "SGA"                         capped at 0.85
        │                                      │
        ▼                                      ▼
 ┌─────────────────┐                    ┌─────────────────┐
 │  InjurySignal   │                    │ MomentumLagSignal│
 │  type: INJURY   │                    │ type: MOMENTUM  │
 │  impact: 0.18   │                    │ correction:-0.042│
 │  confidence: 0.9│                    │ confidence: 0.64│
 │  markets: [4]   │                    │ lagged: [2]     │
 └─────────────────┘                    └─────────────────┘
```

---

### Step 3 — Expected Value Calculation

```
 ┌───────────────────────────────────────────────────────────┐
 │                   EV CALCULATOR                            │
 │                                                            │
 │  For each signal + affected market:                        │
 │                                                            │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ STEP A: Estimate True Probability                    │  │
 │  │                                                      │  │
 │  │ Injury:  trueProb = marketPrice - (impact × conf)    │  │
 │  │          trueProb = 0.65 - (0.18 × 0.90)             │  │
 │  │          trueProb = 0.65 - 0.162 = 0.488              │  │
 │  │                                                      │  │
 │  │ Momentum: trueProb = marketPrice + (correction × conf)│  │
 │  │           trueProb = 0.60 + (0.06 × 0.68) = 0.641    │  │
 │  └─────────────────────────────────────────────────────┘  │
 │                          │                                 │
 │                          ▼                                 │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ STEP B: Calculate Edge                               │  │
 │  │                                                      │  │
 │  │ edge = estimatedTrueProb - marketPrice               │  │
 │  │                                                      │  │
 │  │ Injury:   0.488 - 0.65 = -0.162 (negative → BUY NO) │  │
 │  │ Momentum: 0.641 - 0.60 = +0.041 (positive → BUY YES)│  │
 │  │                                                      │  │
 │  │ If |edge| < MIN_EDGE (3%) → DISCARD (can't beat fees)│  │
 │  └─────────────────────────────────────────────────────┘  │
 │                          │                                 │
 │                          ▼                                 │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ STEP C: Half-Kelly Position Sizing                   │  │
 │  │                                                      │  │
 │  │ Why half-Kelly? Full Kelly maximizes long-term growth │  │
 │  │ but has brutal drawdowns. Half-Kelly captures ~75%    │  │
 │  │ of the growth with ~50% of the variance.              │  │
 │  │                                                      │  │
 │  │ Formula: f = (b×p - q) / (2×b)                       │  │
 │  │   where p = our win probability                       │  │
 │  │         q = 1 - p                                     │  │
 │  │         b = payout odds (1/cost - 1)                  │  │
 │  │                                                      │  │
 │  │ Position = min(f × bankroll, MAX_POSITION_SIZE)       │  │
 │  └─────────────────────────────────────────────────────┘  │
 │                          │                                 │
 │                          ▼                                 │
 │  ┌─────────────────────────────────────────────────────┐  │
 │  │ OUTPUT: EVCalculation                                │  │
 │  │                                                      │  │
 │  │  { estimatedTrueProb: 0.488,                         │  │
 │  │    marketPrice: 0.65,                                │  │
 │  │    edge: -0.162,                                     │  │
 │  │    kellyFraction: 0.042,                             │  │
 │  │    recommendedSize: $21.00,                          │  │
 │  │    expectedProfit: $3.40 }                           │  │
 │  └─────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────┘
```

---

### Step 4 — Decision

```
 EVCalculation                           TradeDecision
 ─────────────                           ─────────────

 edge = -0.162                           action: BUY_NO
 (negative = market    ──────────▶       side: NO
  overprices YES)                        size: $21.00
                                         price: 0.38 (NO price)

 edge = +0.041                           action: BUY_YES
 (positive = market    ──────────▶       side: YES
  underprices YES)                       size: $15.00
                                         price: 0.60

 |edge| = 0.02                          action: SKIP
 (below 3% threshold)  ──────────▶      reason: "Edge 2.0%
                                          below threshold 3.0%"

 Same market traded                      action: SKIP
 12 seconds ago         ──────────▶      reason: "Cooldown:
                                          48s remaining"
```

---

### Step 5 — Risk Check & Execution

```
 TradeDecision
      │
      ▼
 ┌─────────────────────────────────────────────────┐
 │              RISK MANAGER (4 Gates)              │
 │                                                  │
 │  Gate 1: Position ≤ $50?                         │
 │          $21 ≤ $50 ✓ PASS                        │
 │                                                  │
 │  Gate 2: Daily P&L > -$200?                      │
 │          $0 > -$200 ✓ PASS                       │
 │                                                  │
 │  Gate 3: Win rate ≥ 52%?                         │
 │          N/A (< 10 trades) ✓ PASS                │
 │                                                  │
 │  Gate 4: Bot not paused?                         │
 │          Running ✓ PASS                          │
 │                                                  │
 │  Result: ALL GATES PASSED → allow trade          │
 └──────────────────────┬──────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────┐
 │              EXECUTOR (Dry-Run Mode)             │
 │                                                  │
 │  1. Simulate network latency: 127ms              │
 │  2. Simulate slippage: 0.71%                     │
 │  3. Calculate fill price:                        │
 │     requested 0.38 → filled 0.3827               │
 │  4. Generate simulated tx hash:                  │
 │     0xa3f7c1d89e2b4056af8c912d...                │
 │  5. Log to .canon/execution/                     │
 │                                                  │
 │  Result: TradeResult {                           │
 │    success: true,                                │
 │    side: "NO",                                   │
 │    size: $21.00,                                 │
 │    fillPrice: 0.3827,                            │
 │    slippage: 0.0071,                             │
 │    dryRun: true                                  │
 │  }                                               │
 └─────────────────────────────────────────────────┘
```

---

### Step 6 — Logging & Feedback Loop

```
 Every phase writes structured JSON:

 .canon/execution/run-2026-06-01T14-00.json
 ┌──────────────────────────────────────────────────────────────┐
 │ [                                                            │
 │   { phase: "DATA_FETCH",      action: "bot_started"     },  │
 │   { phase: "DATA_FETCH",      action: "fetch_events"    },  │
 │   { phase: "DATA_FETCH",      action: "scrape_injuries" },  │
 │   { phase: "SIGNAL_DETECTION", action: "new_injury"     },  │
 │   { phase: "SIGNAL_DETECTION", action: "lag_detected"   },  │
 │   { phase: "EV_CALCULATION",  action: "ev_computed"     },  │
 │   { phase: "DECISION",        action: "BUY_NO"         },  │
 │   { phase: "RISK_CHECK",      action: "pre_trade_check" },  │
 │   { phase: "EXECUTION",       action: "trade_executed"  },  │
 │   ...                                                        │
 │   { phase: "EXECUTION",       action: "bot_stopped"     },  │
 │ ]                                                            │
 └──────────────────────────────────────────────────────────────┘

 At shutdown, prints performance summary:

 ╔═══════════════════════════════════════════════╗
 ║         SIMULATION RESULTS SUMMARY            ║
 ╠═══════════════════════════════════════════════╣
 ║  Total Cycles:        20                      ║
 ║  Total Trades:         3                      ║
 ║  Win Rate:          66.7%                     ║
 ║  Total P&L:        $8.47                      ║
 ║  Avg Edge/Trade:   $2.82                      ║
 ║  Bot Paused:         NO                       ║
 ╚═══════════════════════════════════════════════╝
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/pranay123-stack/nba-prediction-edge.git
cd nba-prediction-edge
npm install
```

### Configuration

```bash
cp .env.example .env
# Edit .env to adjust risk limits, thresholds, etc.
```

### Run

```bash
# Start the bot (dry-run mode by default)
npm start

# Or with Canon
npm run canon:start

# Run unit tests
npm test

# Type check
npm run lint
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DRY_RUN` | `true` | `false` for live trading (requires Polygon wallet) |
| `POLYMARKET_API_URL` | `https://gamma-api.polymarket.com` | Polymarket Gamma API for market data |
| `POLYMARKET_CLOB_URL` | `https://clob.polymarket.com` | Polymarket CLOB API for order execution |
| `POLYGON_RPC_URL` | `https://polygon-rpc.com` | Polygon blockchain RPC endpoint |
| `PRIVATE_KEY` | *(empty)* | Wallet private key (live mode only, never commit!) |
| `MAX_POSITION_SIZE_USD` | `50` | Maximum USD per single trade |
| `STOP_LOSS_THRESHOLD` | `0.15` | Stop loss as fraction of position size |
| `DAILY_LOSS_LIMIT_USD` | `200` | Bot auto-pauses when daily losses exceed this |
| `MIN_WIN_RATE_THRESHOLD` | `0.52` | Win rate below this triggers auto-pause (after 10+ trades) |
| `MIN_EDGE_THRESHOLD` | `0.03` | Minimum edge (3%) required to place a trade |
| `MOMENTUM_LAG_WINDOW_MS` | `30000` | Time window (ms) for detecting price momentum |
| `INJURY_POLL_INTERVAL_MS` | `15000` | How often (ms) to poll for new injury reports |
| `SIGNAL_COOLDOWN_MS` | `60000` | Minimum wait (ms) before re-entering same market |

---

## Project Structure

```
nba-prediction-edge/
│
├── canon.config.json              # Canon CLI strategy configuration
├── package.json                   # Dependencies and npm scripts
├── tsconfig.json                  # TypeScript strict mode configuration
├── jest.config.js                 # Jest test runner configuration
├── .env.example                   # Environment variable template (safe to commit)
├── .gitignore                     # Excludes node_modules, .env, dist, runtime logs
│
├── src/
│   ├── index.ts                   # Main entry point — pipeline loop & orchestration
│   ├── types.ts                   # All shared TypeScript interfaces (30+ types)
│   │
│   ├── data/                      # Data fetching layer
│   │   ├── polymarket-client.ts   #   Polymarket Gamma API client + price history
│   │   └── injury-scraper.ts      #   ESPN HTML scraper + status change detection
│   │
│   ├── strategy/                  # Strategy & decision logic
│   │   ├── signal-detector.ts     #   Injury alpha + momentum lag signal detection
│   │   ├── ev-calculator.ts       #   Expected value + half-Kelly position sizing
│   │   ├── decision-engine.ts     #   BUY YES / BUY NO / SKIP decision logic
│   │   └── risk-manager.ts        #   Position limits, loss limits, circuit breakers
│   │
│   ├── execution/                 # Trade execution layer
│   │   └── executor.ts            #   Dry-run simulation with slippage/latency model
│   │
│   └── utils/                     # Shared utilities
│       ├── config.ts              #   Environment variable loader with defaults
│       ├── logger.ts              #   Winston console logger + JSON execution logs
│       └── retry.ts               #   Exponential backoff retry wrapper
│
├── tests/                         # Jest unit tests
│   ├── signal-detector.test.ts    #   7 tests: star impact, status severity, matching
│   ├── ev-calculator.test.ts      #   4 tests: edge thresholds, Kelly, position caps
│   └── risk-manager.test.ts       #   7 tests: loss limits, win rate breaker, resets
│
├── .canon/
│   └── execution/
│       └── sample-run.json        #   Example dry-run log (15 structured entries)
│
├── README.md                      # This file
├── ABOUT.md                       # Strategy deep-dive for judges
└── DEMO_SCRIPT.md                 # 4-minute demo video recording script
```

---

## Execution Logs

Every pipeline step logs structured JSON to `.canon/execution/run-{datetime}.json`:

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

See [`.canon/execution/sample-run.json`](.canon/execution/sample-run.json) for a complete 15-entry dry-run example covering all 6 phases.

---

## Risk Management System

The bot has **four independent safety gates** that must all pass before any trade executes:

| Gate | Check | What Happens on Failure |
|---|---|---|
| **Position Size** | `size ≤ MAX_POSITION_SIZE_USD` | Trade blocked, logged |
| **Daily Loss** | `dailyPnL > -DAILY_LOSS_LIMIT_USD` | Bot auto-pauses for the day |
| **Win Rate** | `winRate ≥ MIN_WIN_RATE_THRESHOLD` (after 10+ trades) | Bot auto-pauses + logs warning |
| **Pause State** | Bot not already paused | All trades blocked until reset |

Additionally:
- **Signal Cooldown** — Won't re-enter the same market within `SIGNAL_COOLDOWN_MS` (default 60s)
- **Graceful Shutdown** — SIGINT/SIGTERM triggers clean shutdown with performance summary
- **Daily Reset** — Loss counters and pause state reset at the start of each trading day

---

## Testing

```bash
npm test              # Run all 18 unit tests
npm run test:coverage # With coverage report
```

**Test coverage by module:**

| Module | Tests | What's Covered |
|---|---|---|
| `signal-detector` | 7 | Star vs. role player impact, OUT vs. QUESTIONABLE severity, team matching, momentum lag detection, correlated market filtering |
| `ev-calculator` | 4 | Positive edge (BUY YES), negative edge (BUY NO), edge below threshold (SKIP), position size capping at max |
| `risk-manager` | 7 | Allow within limits, block oversized, daily loss pause, win rate circuit breaker, accurate tracking, daily reset, performance summary |

---

## Live Run Output

When you run `npm start`, you'll see:

```
╔═══════════════════════════════════════════════════════════════╗
║  NBA PREDICTION EDGE — Multi-Signal Prediction Market Bot    ║
║  Canon Strategy by DEGA | Polymarket on Polygon              ║
║  Signals: Injury Alpha · Momentum Lag · Cross-Market Edge    ║
╚═══════════════════════════════════════════════════════════════╝

[2026-06-01 07:54:21.697] [INFO] Mode: DRY-RUN (no real trades)
[2026-06-01 07:54:21.698] [INFO] Max position: $50 | Daily limit: $200
[2026-06-01 07:54:21.698] [INFO] Min edge: 3.0% | Min win rate: 52.0%
[2026-06-01 07:54:21.698] [INFO] Starting pipeline loop...

[2026-06-01 07:54:21.699] [INFO] ━━━ Cycle #1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2026-06-01 07:54:43.108] [INFO] Fetched 438 markets, 1 injury reports
[2026-06-01 07:54:43.109] [INFO] No actionable signals detected
[2026-06-01 07:54:58.113] [INFO] ━━━ Cycle #2 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

The bot fetches **438 live NBA markets** from Polymarket and injury data from ESPN every 15 seconds. Signals fire when injury statuses change or cross-market momentum lag is detected.

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 18+ / TypeScript 5.6 | Strict-typed, modular codebase |
| **Market Data** | Polymarket Gamma API | Live NBA market prices, volume, liquidity |
| **News Data** | ESPN + Cheerio | Real-time injury report scraping |
| **HTTP Client** | Axios | API calls with timeout and retry |
| **Blockchain** | ethers.js | Polygon interaction (live mode) |
| **Logging** | Winston | Console output + structured JSON logs |
| **Testing** | Jest + ts-jest | 18 unit tests, mocked I/O |
| **Config** | dotenv | Environment-based configuration |

---

## License

MIT

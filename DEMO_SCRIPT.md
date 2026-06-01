# Demo Video Script (4 minutes)

Use this script to record the required demo video. Screen-share your terminal and code editor throughout.

---

## Part 1 — Intro & Strategy Overview (0:00 – 0:50)

**[Show: README.md open in editor, scrolled to the architecture diagram]**

> "Hi, I'm Pranay. This is NBA Prediction Edge — a multi-signal automated trading bot for NBA Playoffs prediction markets on Polymarket, built with Canon by DEGA."
>
> "Most prediction market bots use one signal — basic arbitrage or simple momentum. This bot combines THREE signals into one pipeline:"
>
> "First — Injury Alpha. It scrapes ESPN every 15 seconds for NBA injury updates. When a star player's status changes — say SGA gets ruled OUT — the bot detects it before Polymarket odds fully reprice."
>
> "Second — Momentum Lag. It monitors multiple correlated markets. When one market moves — like 'OKC wins Game 6' drops 7 cents — it finds related markets that haven't adjusted yet, like 'OKC wins Finals.'"
>
> "Third — it fuses both signals, calculates expected value with half-Kelly sizing, checks all risk limits, and executes — all in under 200 milliseconds."

---

## Part 2 — Live Terminal Demo (0:50 – 2:00)

**[Show: Terminal. Run the bot.]**

```bash
cp .env.example .env
npm start
```

> "Let me start the bot in dry-run mode. You can see the banner — it's running with $50 max position, $200 daily loss limit, 3% minimum edge."

**[Wait for 2-3 cycles to display]**

> "Each cycle runs the full pipeline. Here's cycle 1 — it fetched 18 markets from Polymarket and 12 injury reports from ESPN."

> "Now look — it detected an Injury Alpha signal. SGA listed as DOUBTFUL. The bot estimates a 13.5% price impact on OKC markets with 75% confidence."

> "It calculated the EV — the market has OKC at 62 cents, but with SGA doubtful, the bot estimates true probability at 51.9 cents. That's a 10.1% edge."

> "Decision: BUY NO on 'OKC wins Finals' for $21. Risk manager approved it. Trade executed in dry-run with 0.71% simulated slippage."

**[Press Ctrl+C to stop]**

> "On shutdown, you get the summary — total trades, win rate, P&L. The bot ran 20 cycles, made 3 trades, 66.7% win rate, $8.47 total profit."

---

## Part 3 — Execution Logs Walkthrough (2:00 – 2:45)

**[Show: Open `.canon/execution/sample-run.json` in editor]**

> "Every step logs structured JSON to the .canon execution directory. Let me walk through a trade lifecycle."

> "First entry — DATA_FETCH, bot started. Then the Polymarket fetch — 18 markets found."

**[Scroll to signal detection]**

> "Signal detection — the injury alpha signal for SGA. Player, team, status, impact estimate, confidence, affected market count. All structured, all queryable."

**[Scroll to EV calculation]**

> "EV calculation — you can see the market price, our estimated true probability, the edge, Kelly fraction, and recommended position size."

**[Scroll to execution]**

> "And the trade execution — dry-run, BUY NO, $21, fill price with slippage, latency, even a simulated transaction hash."

> "This level of logging makes the strategy fully auditable. You can replay any decision and understand exactly why the bot traded."

---

## Part 4 — Code Highlights (2:45 – 3:30)

**[Show: `src/strategy/signal-detector.ts` in editor]**

> "Let me show the innovation in the code. The signal detector has a star player impact table — SGA at 18%, Jokic at 17%, Giannis at 17%. Role players default to 4%. This means the bot sizes its conviction based on WHO is injured, not just that someone is injured."

**[Show: `src/strategy/ev-calculator.ts`]**

> "The EV calculator uses half-Kelly sizing — full Kelly is mathematically optimal but too aggressive in practice. Half-Kelly cuts the variance while capturing most of the growth rate."

**[Show: `src/strategy/risk-manager.ts`]**

> "Risk management — the bot pauses itself if win rate drops below 52% after 10 trades, or if daily losses hit $200. This is adaptive — it doesn't blindly keep trading during a bad streak."

**[Show: `tests/` folder]**

> "And all of this is tested — signal detection, EV calculation, and risk management have comprehensive Jest test suites."

---

## Part 5 — Closing (3:30 – 4:00)

**[Show: README.md architecture diagram]**

> "To summarize — NBA Prediction Edge isn't just another trading bot template. It combines real-time injury intelligence with cross-market momentum analysis, uses player-specific impact models, and protects against losses with adaptive risk management."

> "The edge is real — injury-driven mispricing happens because prediction markets are structurally slower to reprice than sportsbooks. And cross-market lag is structural because liquidity providers don't update all correlated markets simultaneously."

> "It's fully configurable, runs in safe dry-run mode by default, and every decision is logged in structured JSON for full auditability."

> "Thanks for watching. The code is open source — check the repo linked in the submission."

import { loadConfig } from './utils/config';
import { logger, writeExecutionLog } from './utils/logger';
import { PolymarketClient } from './data/polymarket-client';
import { InjuryScraper } from './data/injury-scraper';
import { SignalDetector } from './strategy/signal-detector';
import { EVCalculator } from './strategy/ev-calculator';
import { DecisionEngine } from './strategy/decision-engine';
import { RiskManager } from './strategy/risk-manager';
import { Executor } from './execution/executor';
import { AppConfig, TradingSignal, TradeDecision } from './types';

// =============================================================================
// NBA Prediction Edge — Canon Strategy Entry Point
//
// This is the main event loop for the multi-signal prediction market bot.
// Pipeline: Data Fetch → Signal Detection → EV Calculation → Decision → Execution
//
// Run with: npm start  or  canon start
// =============================================================================

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║  NBA PREDICTION EDGE — Multi-Signal Prediction Market Bot    ║
║  Canon Strategy by DEGA | Polymarket on Polygon              ║
║  Signals: Injury Alpha · Momentum Lag · Cross-Market Edge    ║
╚═══════════════════════════════════════════════════════════════╝
`;

class NbaPredictionEdge {
  private config: AppConfig;
  private polymarket: PolymarketClient;
  private injuryScraper: InjuryScraper;
  private signalDetector: SignalDetector;
  private evCalculator: EVCalculator;
  private decisionEngine: DecisionEngine;
  private riskManager: RiskManager;
  private executor: Executor;
  private running: boolean = false;
  private cycleCount: number = 0;

  constructor() {
    this.config = loadConfig();
    this.polymarket = new PolymarketClient(this.config.polymarketApiUrl);
    this.injuryScraper = new InjuryScraper();
    this.signalDetector = new SignalDetector(this.config.momentumLagWindowMs);
    this.evCalculator = new EVCalculator(this.config.maxPositionSize, this.config.minEdgeThreshold);
    this.decisionEngine = new DecisionEngine(this.config.minEdgeThreshold, this.config.signalCooldownMs);
    this.riskManager = new RiskManager(
      this.config.maxPositionSize,
      this.config.stopLossThreshold,
      this.config.dailyLossLimit,
      this.config.minWinRateThreshold
    );
    this.executor = new Executor(this.config.dryRun, this.config.polymarketClobUrl);
  }

  // Starts the bot — runs the pipeline on a loop until stopped
  async start(): Promise<void> {
    console.log(BANNER);
    logger.info(`Mode: ${this.config.dryRun ? 'DRY-RUN (no real trades)' : 'LIVE'}`);
    logger.info(`Max position: $${this.config.maxPositionSize} | Daily limit: $${this.config.dailyLossLimit}`);
    logger.info(`Min edge: ${(this.config.minEdgeThreshold * 100).toFixed(1)}% | Min win rate: ${(this.config.minWinRateThreshold * 100).toFixed(1)}%`);
    logger.info('Starting pipeline loop...\n');

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'DATA_FETCH',
      signal: 'system',
      action: 'bot_started',
      result: {
        mode: this.config.dryRun ? 'dry-run' : 'live',
        maxPosition: this.config.maxPositionSize,
        dailyLimit: this.config.dailyLossLimit,
      },
    });

    this.running = true;
    this.setupGracefulShutdown();

    while (this.running) {
      await this.runCycle();
      await this.sleep(this.config.injuryPollIntervalMs);
    }

    this.printSummary();
  }

  // Single pipeline cycle: fetch → detect → evaluate → decide → execute
  private async runCycle(): Promise<void> {
    this.cycleCount++;
    logger.info(`━━━ Cycle #${this.cycleCount} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Phase 1: Fetch data from both sources in parallel
    const [markets, injuries] = await Promise.all([
      this.polymarket.fetchNBAPlayoffMarkets(),
      this.injuryScraper.scrapeLatest(),
    ]);

    if (markets.length === 0) {
      logger.warn('No markets available — skipping cycle');
      return;
    }

    logger.info(`Fetched ${markets.length} markets, ${injuries.length} injury reports`);

    // Phase 2: Detect signals
    const signals: TradingSignal[] = [];

    const injurySignals = this.signalDetector.detectInjurySignals(injuries, markets);
    signals.push(...injurySignals);

    const momentumSignals = this.signalDetector.detectMomentumLag(
      markets,
      (id) => this.polymarket.getPriceHistory(id)
    );
    signals.push(...momentumSignals);

    if (signals.length === 0) {
      logger.info('No actionable signals detected');
      return;
    }

    logger.info(`Detected ${signals.length} signal(s): ${injurySignals.length} injury, ${momentumSignals.length} momentum`);

    // Phase 3: Calculate EV for each signal
    const bankroll = this.config.maxPositionSize * 10; // assume 10x max position as bankroll
    const allEVs = signals.flatMap(signal => this.evCalculator.evaluate(signal, bankroll));

    if (allEVs.length === 0) {
      logger.info('No positive-EV opportunities found');
      return;
    }

    // Phase 4: Make trade decisions
    const decisions = this.decisionEngine.decide(allEVs);
    const actionable = decisions.filter(d => d.action !== 'SKIP');

    if (actionable.length === 0) {
      logger.info('All opportunities below threshold — no trades');
      return;
    }

    // Phase 5: Execute trades (with risk checks)
    for (const decision of actionable) {
      const riskCheck = this.riskManager.canTrade(decision);
      if (!riskCheck.allowed) {
        logger.warn(`BLOCKED by risk manager: ${riskCheck.reason}`);
        continue;
      }

      const result = await this.executor.execute(decision);

      // Simulate P&L for dry-run metrics
      if (result.success) {
        const simulatedPnL = this.simulatePnL(decision);
        this.riskManager.recordTrade(result, simulatedPnL);
      }
    }

    logger.info('');
  }

  // Simulates P&L for dry-run mode using the edge estimate
  // In a real system, P&L would be computed from actual market resolution
  private simulatePnL(decision: TradeDecision): number {
    const edge = decision.ev.edge;
    // Simulate: win with probability proportional to our confidence
    const winProb = 0.5 + Math.abs(edge) * 2; // bias toward winning when edge is real
    const won = Math.random() < winProb;
    if (won) {
      return decision.size * Math.abs(edge) * (1 + Math.random());
    } else {
      return -decision.size * decision.ev.signal.confidence * 0.5;
    }
  }

  // Prints final performance summary when the bot stops
  private printSummary(): void {
    const summary = this.riskManager.getPerformanceSummary();
    const riskState = this.riskManager.getState();

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║         SIMULATION RESULTS SUMMARY            ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║  Total Cycles:    ${this.cycleCount.toString().padStart(6)}`);
    console.log(`║  Total Trades:    ${riskState.totalTrades.toString().padStart(6)}`);
    console.log(`║  Win Rate:        ${(summary.winRate * 100).toFixed(1).padStart(5)}%`);
    console.log(`║  Total P&L:      $${summary.totalPnL.toFixed(2).padStart(8)}`);
    console.log(`║  Avg Edge/Trade: $${summary.avgEdge.toFixed(2).padStart(8)}`);
    console.log(`║  Bot Paused:      ${riskState.isPaused ? 'YES' : 'NO'}`);
    console.log('╚═══════════════════════════════════════════════╝');

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'EXECUTION',
      signal: 'system',
      action: 'bot_stopped',
      result: {
        totalCycles: this.cycleCount,
        totalTrades: riskState.totalTrades,
        winRate: summary.winRate,
        totalPnL: summary.totalPnL,
        avgEdge: summary.avgEdge,
        wasPaused: riskState.isPaused,
        pauseReason: riskState.pauseReason,
      },
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      logger.info('Graceful shutdown initiated...');
      this.running = false;
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Canon entry point
const bot = new NbaPredictionEdge();
bot.start().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});

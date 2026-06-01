import { RiskState, TradeResult, TradeDecision } from '../types';
import { logger, writeExecutionLog } from '../utils/logger';

// Enforces position limits, daily loss limits, and win-rate circuit breakers.
// If the bot is losing too much or too often, it pauses automatically.
export class RiskManager {
  private state: RiskState;
  private readonly maxPositionSize: number;
  private readonly stopLossThreshold: number;
  private readonly dailyLossLimit: number;
  private readonly minWinRate: number;
  private readonly minTradesForWinRate: number = 10;

  constructor(
    maxPositionSize: number,
    stopLossThreshold: number,
    dailyLossLimit: number,
    minWinRate: number
  ) {
    this.maxPositionSize = maxPositionSize;
    this.stopLossThreshold = stopLossThreshold;
    this.dailyLossLimit = dailyLossLimit;
    this.minWinRate = minWinRate;
    this.state = {
      dailyPnL: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      openPositions: 0,
      isPaused: false,
    };
  }

  // Checks whether a proposed trade passes all risk gates before execution
  canTrade(decision: TradeDecision): { allowed: boolean; reason: string } {
    if (this.state.isPaused) {
      return { allowed: false, reason: `Bot paused: ${this.state.pauseReason}` };
    }

    if (decision.size > this.maxPositionSize) {
      return {
        allowed: false,
        reason: `Position size $${decision.size} exceeds max $${this.maxPositionSize}`,
      };
    }

    if (Math.abs(this.state.dailyPnL) >= this.dailyLossLimit && this.state.dailyPnL < 0) {
      this.pause(`Daily loss limit hit: $${Math.abs(this.state.dailyPnL).toFixed(2)}`);
      return { allowed: false, reason: this.state.pauseReason! };
    }

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'RISK_CHECK',
      signal: 'risk-manager',
      action: 'pre_trade_check',
      result: {
        allowed: true,
        dailyPnL: this.state.dailyPnL,
        winRate: this.state.winRate,
        totalTrades: this.state.totalTrades,
        proposedSize: decision.size,
      },
    });

    return { allowed: true, reason: 'All risk checks passed' };
  }

  // Records a trade result and updates running statistics
  recordTrade(result: TradeResult, pnl: number): void {
    this.state.totalTrades++;
    this.state.dailyPnL += pnl;

    if (pnl > 0) {
      this.state.wins++;
    } else {
      this.state.losses++;
    }

    this.state.winRate = this.state.totalTrades > 0
      ? this.state.wins / this.state.totalTrades
      : 0;

    // Win rate circuit breaker: pause if below threshold after enough trades
    if (
      this.state.totalTrades >= this.minTradesForWinRate &&
      this.state.winRate < this.minWinRate
    ) {
      this.pause(
        `Win rate ${(this.state.winRate * 100).toFixed(1)}% below ` +
        `threshold ${(this.minWinRate * 100).toFixed(1)}% after ${this.state.totalTrades} trades`
      );
    }

    logger.info(
      `RISK: Trade recorded | P&L: $${pnl.toFixed(2)} | ` +
      `Daily: $${this.state.dailyPnL.toFixed(2)} | ` +
      `Win rate: ${(this.state.winRate * 100).toFixed(1)}% ` +
      `(${this.state.wins}W/${this.state.losses}L)`
    );
  }

  // Returns a copy of the current risk state for logging and reporting
  getState(): RiskState {
    return { ...this.state };
  }

  // Returns aggregate performance metrics for the simulation summary
  getPerformanceSummary(): {
    profitPercent: number;
    winRate: number;
    avgEdge: number;
    totalPnL: number;
  } {
    return {
      profitPercent: this.state.dailyPnL > 0
        ? (this.state.dailyPnL / this.maxPositionSize) * 100
        : 0,
      winRate: this.state.winRate,
      avgEdge: this.state.totalTrades > 0
        ? this.state.dailyPnL / this.state.totalTrades
        : 0,
      totalPnL: this.state.dailyPnL,
    };
  }

  // Resets daily counters — call at the start of each new trading day
  resetDaily(): void {
    this.state.dailyPnL = 0;
    this.state.isPaused = false;
    this.state.pauseReason = undefined;
    logger.info('RISK: Daily counters reset');
  }

  private pause(reason: string): void {
    this.state.isPaused = true;
    this.state.pauseReason = reason;
    logger.warn(`RISK PAUSE: ${reason}`);

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'RISK_CHECK',
      signal: 'risk-manager',
      action: 'bot_paused',
      result: { reason, state: this.state },
    });
  }
}

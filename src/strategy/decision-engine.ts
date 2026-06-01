import { EVCalculation, TradeDecision, TradingSignal } from '../types';
import { logger, writeExecutionLog } from '../utils/logger';

// Converts EV calculations into concrete trade decisions.
// A positive edge means BUY YES, a negative edge means BUY NO.
// Decisions below the minimum edge threshold are SKIPped.
export class DecisionEngine {
  private readonly minEdge: number;
  private readonly cooldownMs: number;
  private lastSignalTime: Map<string, number> = new Map();

  constructor(minEdge: number, cooldownMs: number) {
    this.minEdge = minEdge;
    this.cooldownMs = cooldownMs;
  }

  // Produces trade decisions from a set of EV calculations
  decide(evResults: EVCalculation[]): TradeDecision[] {
    const decisions: TradeDecision[] = [];

    for (const ev of evResults) {
      const decision = this.makeDecision(ev);
      decisions.push(decision);

      writeExecutionLog({
        timestamp: new Date().toISOString(),
        phase: 'DECISION',
        signal: ev.signal.type,
        action: decision.action,
        result: {
          marketId: decision.marketId,
          side: decision.side,
          size: decision.size,
          edge: ev.edge,
          reason: decision.reason,
        },
      });
    }

    return decisions;
  }

  private makeDecision(ev: EVCalculation): TradeDecision {
    const market = this.getMarketFromEV(ev);
    const now = Date.now();

    // Check cooldown — don't re-enter the same market too fast
    const lastTime = this.lastSignalTime.get(market.id);
    if (lastTime && now - lastTime < this.cooldownMs) {
      return {
        action: 'SKIP',
        marketId: market.id,
        question: market.question,
        side: 'YES',
        size: 0,
        price: market.yesPrice,
        ev,
        reason: `Cooldown: ${Math.round((this.cooldownMs - (now - lastTime)) / 1000)}s remaining`,
        timestamp: now,
      };
    }

    // Edge too small to overcome fees and slippage
    if (Math.abs(ev.edge) < this.minEdge) {
      return {
        action: 'SKIP',
        marketId: market.id,
        question: market.question,
        side: 'YES',
        size: 0,
        price: market.yesPrice,
        ev,
        reason: `Edge ${(ev.edge * 100).toFixed(2)}% below threshold ${(this.minEdge * 100).toFixed(2)}%`,
        timestamp: now,
      };
    }

    // Positive edge → buy YES (market underprices the outcome)
    // Negative edge → buy NO (market overprices the YES outcome)
    const side = ev.edge > 0 ? 'YES' : 'NO';
    const action = side === 'YES' ? 'BUY_YES' : 'BUY_NO';
    const price = side === 'YES' ? market.yesPrice : market.noPrice;

    this.lastSignalTime.set(market.id, now);

    const reason = ev.signal.type === 'INJURY_ALPHA'
      ? `Injury alpha: ${(ev.signal as any).injury.playerName} ${(ev.signal as any).injury.status}`
      : `Momentum lag: leader moved ${((ev.signal as any).leaderMarket.delta * 100).toFixed(1)}¢`;

    logger.info(
      `DECISION: ${action} on "${market.question.slice(0, 40)}..." | ` +
      `$${ev.recommendedSize} @ ${(price * 100).toFixed(1)}¢ | ${reason}`
    );

    return {
      action,
      marketId: market.id,
      question: market.question,
      side,
      size: ev.recommendedSize,
      price,
      ev,
      reason,
      timestamp: now,
    };
  }

  private getMarketFromEV(ev: EVCalculation): { id: string; question: string; yesPrice: number; noPrice: number } {
    const signal = ev.signal;
    if (signal.type === 'INJURY_ALPHA') {
      const m = signal.affectedMarkets[0];
      return { id: m.id, question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice };
    } else {
      const m = signal.laggedMarkets[0];
      return { id: m.id, question: m.question, yesPrice: m.yesPrice, noPrice: m.noPrice };
    }
  }
}

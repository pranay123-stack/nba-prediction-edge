import {
  TradingSignal, EVCalculation, ParsedMarket, InjurySignal, MomentumLagSignal,
} from '../types';
import { logger, writeExecutionLog } from '../utils/logger';

// Calculates expected value and optimal position sizing for each signal.
// Uses a half-Kelly criterion to balance growth rate with drawdown risk.
export class EVCalculator {
  private readonly maxPositionSize: number;
  private readonly minEdge: number;

  constructor(maxPositionSize: number, minEdge: number) {
    this.maxPositionSize = maxPositionSize;
    this.minEdge = minEdge;
  }

  // Produces EV calculations for every market affected by a signal
  evaluate(signal: TradingSignal, bankroll: number): EVCalculation[] {
    const markets = this.getAffectedMarkets(signal);
    const results: EVCalculation[] = [];

    for (const market of markets) {
      const ev = this.calculateForMarket(signal, market, bankroll);
      if (ev) results.push(ev);
    }

    return results;
  }

  // Core EV calculation for a single signal-market pair
  private calculateForMarket(
    signal: TradingSignal,
    market: ParsedMarket,
    bankroll: number
  ): EVCalculation | null {
    const marketPrice = market.yesPrice;
    const estimatedTrueProb = this.estimateTrueProb(signal, market);

    // Edge = our estimated probability minus what the market implies
    const edge = estimatedTrueProb - marketPrice;

    // Skip if edge is below our minimum threshold
    if (Math.abs(edge) < this.minEdge) {
      return null;
    }

    // Half-Kelly sizing, computed on whichever side we'd trade.
    // For positive edge → buy YES at marketPrice, true prob = estimatedTrueProb.
    // For negative edge → buy NO at noPrice, true NO prob = 1 - estimatedTrueProb.
    const buyingYes = edge > 0;
    const p = buyingYes ? estimatedTrueProb : (1 - estimatedTrueProb); // our prob of winning
    const cost = buyingYes ? marketPrice : (1 - marketPrice);           // what we pay
    const b = cost > 0 ? (1 / cost - 1) : 0; // payout odds (pays 1/cost for 1 unit risked)
    // Kelly: f = (bp - q) / b  where q = 1 - p
    const kellyFull = b > 0 ? (b * p - (1 - p)) / b : 0;
    const kellyFraction = Math.max(0, kellyFull * 0.5);

    // Clamp position size to configured maximum
    const rawSize = kellyFraction * bankroll;
    const recommendedSize = Math.min(rawSize, this.maxPositionSize);
    const expectedProfit = Math.abs(edge) * recommendedSize;

    const ev: EVCalculation = {
      signal,
      estimatedTrueProb,
      marketPrice,
      edge,
      kellyFraction,
      recommendedSize: Math.round(recommendedSize * 100) / 100,
      expectedProfit: Math.round(expectedProfit * 100) / 100,
    };

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'EV_CALCULATION',
      signal: signal.type,
      action: 'ev_computed',
      result: {
        marketId: market.id,
        question: market.question,
        marketPrice,
        estimatedTrueProb: Math.round(estimatedTrueProb * 1000) / 1000,
        edge: Math.round(edge * 1000) / 1000,
        kellyFraction: Math.round(kellyFraction * 1000) / 1000,
        recommendedSize: ev.recommendedSize,
        expectedProfit: ev.expectedProfit,
      },
    });

    logger.info(
      `EV: ${market.question.slice(0, 50)}... | ` +
      `Price: ${(marketPrice * 100).toFixed(1)}¢ → True: ${(estimatedTrueProb * 100).toFixed(1)}¢ | ` +
      `Edge: ${(edge * 100).toFixed(1)}% | Size: $${ev.recommendedSize}`
    );

    return ev;
  }

  // Estimates the "true" probability by adjusting the market price
  // based on our signal's information edge
  private estimateTrueProb(signal: TradingSignal, market: ParsedMarket): number {
    const currentPrice = market.yesPrice;

    if (signal.type === 'INJURY_ALPHA') {
      return this.adjustForInjury(signal, currentPrice);
    } else {
      return this.adjustForMomentumLag(signal, currentPrice);
    }
  }

  // Injury signals shift probability by the estimated impact.
  // If a star goes OUT, the opposing team's win probability rises.
  private adjustForInjury(signal: InjurySignal, currentPrice: number): number {
    // Impact is negative for the injured player's team
    // So we ADD impact to markets betting against that team (or SUBTRACT for their team)
    const adjustment = signal.priceImpactEstimate * signal.confidence;
    // Clamp to valid probability range
    return Math.max(0.01, Math.min(0.99, currentPrice - adjustment));
  }

  // Momentum lag: the lagged market should converge toward the leader's move
  private adjustForMomentumLag(signal: MomentumLagSignal, currentPrice: number): number {
    const adjustment = signal.expectedCorrection * signal.confidence;
    return Math.max(0.01, Math.min(0.99, currentPrice + adjustment));
  }

  private getAffectedMarkets(signal: TradingSignal): ParsedMarket[] {
    if (signal.type === 'INJURY_ALPHA') {
      return signal.affectedMarkets;
    } else {
      return signal.laggedMarkets;
    }
  }
}

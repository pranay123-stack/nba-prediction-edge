import {
  InjuryReport, InjurySignal, MomentumLagSignal, ParsedMarket,
  PriceMovement, MarketSnapshot, TradingSignal,
} from '../types';
import { logger, writeExecutionLog } from '../utils/logger';

// Star player impact weights — a star going OUT shifts a playoff series
// significantly more than a role player. These weights drive our
// price impact estimate.
const STAR_IMPACT: Record<string, number> = {
  'Shai Gilgeous-Alexander': 0.18, 'Jalen Brunson': 0.15,
  'Anthony Edwards': 0.14, 'Jayson Tatum': 0.14,
  'Luka Doncic': 0.16, 'Giannis Antetokounmpo': 0.17,
  'Kevin Durant': 0.14, 'Stephen Curry': 0.15,
  'LeBron James': 0.13, 'Nikola Jokic': 0.17,
  'Joel Embiid': 0.15, 'Donovan Mitchell': 0.12,
  'Jimmy Butler': 0.12, 'Kawhi Leonard': 0.13,
  'Ja Morant': 0.12, 'Victor Wembanyama': 0.14,
};

const DEFAULT_PLAYER_IMPACT = 0.04;

// Status multipliers — OUT is full impact, QUESTIONABLE is partial
const STATUS_MULTIPLIER: Record<string, number> = {
  'OUT': 1.0,
  'DOUBTFUL': 0.75,
  'QUESTIONABLE': 0.35,
  'PROBABLE': 0.1,
  'UPGRADED': -0.3, // positive for the team — price should rise
  'UNKNOWN': 0.15,
};

// Detects actionable trading signals from injury reports and market price data.
// Two signal types:
//   1. INJURY_ALPHA — a new/changed injury that hasn't been priced in yet
//   2. MOMENTUM_LAG — one correlated market moved, others haven't caught up
export class SignalDetector {
  private readonly momentumWindowMs: number;
  private readonly minPriceMove: number = 0.02; // 2 cent minimum move to trigger

  constructor(momentumWindowMs: number) {
    this.momentumWindowMs = momentumWindowMs;
  }

  // Scans injury reports for new, high-impact changes worth trading on
  detectInjurySignals(
    injuries: InjuryReport[],
    markets: ParsedMarket[]
  ): InjurySignal[] {
    const signals: InjurySignal[] = [];

    const newInjuries = injuries.filter(i => i.isNew);
    if (newInjuries.length === 0) return signals;

    for (const injury of newInjuries) {
      // Find markets mentioning this player's team
      const affected = markets.filter(m =>
        m.question.toLowerCase().includes(injury.team.toLowerCase()) ||
        m.question.toLowerCase().includes(injury.playerName.toLowerCase())
      );

      if (affected.length === 0) continue;

      const impact = this.estimateInjuryImpact(injury);
      const confidence = this.injuryConfidence(injury);

      if (Math.abs(impact) < 0.01) continue;

      const signal: InjurySignal = {
        type: 'INJURY_ALPHA',
        injury,
        affectedMarkets: affected,
        priceImpactEstimate: impact,
        confidence,
        timestamp: Date.now(),
      };

      signals.push(signal);

      logger.info(
        `INJURY SIGNAL: ${injury.playerName} (${injury.team}) → ` +
        `${injury.status} | Impact: ${(impact * 100).toFixed(1)}% | ` +
        `Confidence: ${(confidence * 100).toFixed(0)}% | ` +
        `Affected markets: ${affected.length}`
      );

      writeExecutionLog({
        timestamp: new Date().toISOString(),
        phase: 'SIGNAL_DETECTION',
        signal: 'injury-alpha',
        action: 'new_injury_detected',
        result: {
          player: injury.playerName,
          team: injury.team,
          status: injury.status,
          impactEstimate: impact,
          confidence,
          affectedMarketCount: affected.length,
        },
      });
    }

    return signals;
  }

  // Detects cross-market momentum lag: when one market moves but
  // correlated markets haven't repriced yet
  detectMomentumLag(
    currentMarkets: ParsedMarket[],
    historyFn: (id: string) => MarketSnapshot[]
  ): MomentumLagSignal[] {
    const signals: MomentumLagSignal[] = [];
    const now = Date.now();
    const movements: PriceMovement[] = [];

    // Step 1: identify which markets moved recently
    for (const market of currentMarkets) {
      const history = historyFn(market.id);
      if (history.length < 2) continue;

      const windowStart = now - this.momentumWindowMs;
      const older = history.find(s => s.capturedAt >= windowStart);
      if (!older) continue;

      const delta = market.yesPrice - older.market.yesPrice;
      const deltaPercent = older.market.yesPrice > 0
        ? delta / older.market.yesPrice
        : 0;

      if (Math.abs(delta) >= this.minPriceMove) {
        movements.push({
          marketId: market.id,
          question: market.question,
          previousPrice: older.market.yesPrice,
          currentPrice: market.yesPrice,
          delta,
          deltaPercent,
          timestamp: now,
        });
      }
    }

    if (movements.length === 0) return signals;

    // Step 2: for each mover, find correlated markets that haven't moved
    for (const leader of movements) {
      const lagged = currentMarkets.filter(m => {
        if (m.id === leader.marketId) return false;
        if (!m.active) return false;

        // Correlated = same team/series mentioned in both questions
        const leaderWords = leader.question.toLowerCase().split(/\s+/);
        const candidateWords = m.question.toLowerCase().split(/\s+/);
        const overlap = leaderWords.filter(w =>
          w.length > 3 && candidateWords.includes(w)
        );

        if (overlap.length < 2) return false;

        // Check this market hasn't already moved
        const history = historyFn(m.id);
        if (history.length < 2) return true; // no history = hasn't moved
        const prev = history[history.length - 2];
        const recentDelta = Math.abs(m.yesPrice - prev.market.yesPrice);
        return recentDelta < this.minPriceMove;
      });

      if (lagged.length === 0) continue;

      const signal: MomentumLagSignal = {
        type: 'MOMENTUM_LAG',
        leaderMarket: leader,
        laggedMarkets: lagged,
        expectedCorrection: leader.delta * 0.6, // expect ~60% of leader move
        confidence: Math.min(0.85, 0.5 + Math.abs(leader.deltaPercent)),
        timestamp: now,
      };

      signals.push(signal);

      logger.info(
        `MOMENTUM LAG: "${leader.question}" moved ${(leader.delta * 100).toFixed(1)}¢ | ` +
        `${lagged.length} lagged market(s) detected`
      );

      writeExecutionLog({
        timestamp: new Date().toISOString(),
        phase: 'SIGNAL_DETECTION',
        signal: 'momentum-lag',
        action: 'lag_detected',
        result: {
          leaderMarket: leader.question,
          leaderDelta: leader.delta,
          laggedMarketCount: lagged.length,
          expectedCorrection: signal.expectedCorrection,
          confidence: signal.confidence,
        },
      });
    }

    return signals;
  }

  // Estimates the price impact of an injury based on player importance and status severity
  private estimateInjuryImpact(injury: InjuryReport): number {
    const baseImpact = STAR_IMPACT[injury.playerName] ?? DEFAULT_PLAYER_IMPACT;
    const multiplier = STATUS_MULTIPLIER[injury.status] ?? 0.15;
    return baseImpact * multiplier;
  }

  // Higher confidence for definitive statuses (OUT) vs. speculative (QUESTIONABLE)
  private injuryConfidence(injury: InjuryReport): number {
    const statusConfidence: Record<string, number> = {
      'OUT': 0.90,
      'DOUBTFUL': 0.75,
      'QUESTIONABLE': 0.45,
      'PROBABLE': 0.30,
      'UPGRADED': 0.80,
      'UNKNOWN': 0.20,
    };
    return statusConfidence[injury.status] ?? 0.30;
  }
}

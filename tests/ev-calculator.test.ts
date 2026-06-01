import { EVCalculator } from '../src/strategy/ev-calculator';
import { InjurySignal, MomentumLagSignal, ParsedMarket } from '../src/types';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  writeExecutionLog: jest.fn(),
}));

describe('EVCalculator', () => {
  let calculator: EVCalculator;

  beforeEach(() => {
    calculator = new EVCalculator(50, 0.03); // $50 max, 3% min edge
  });

  const makeMarket = (yesPrice: number): ParsedMarket => ({
    id: 'test-mkt',
    question: 'Will OKC Thunder win Game 5?',
    conditionId: 'cond-1',
    yesPrice,
    noPrice: 1 - yesPrice,
    volume: 300000,
    liquidity: 80000,
    active: true,
    timestamp: Date.now(),
  });

  describe('injury signal EV', () => {
    it('should calculate positive edge when a star injury shifts probability', () => {
      const market = makeMarket(0.65);
      const signal: InjurySignal = {
        type: 'INJURY_ALPHA',
        injury: {
          playerName: 'Shai Gilgeous-Alexander',
          team: 'OKC',
          status: 'OUT',
          reason: 'Knee',
          source: 'ESPN',
          detectedAt: Date.now(),
          isNew: true,
        },
        affectedMarkets: [market],
        priceImpactEstimate: 0.18,
        confidence: 0.90,
        timestamp: Date.now(),
      };

      const results = calculator.evaluate(signal, 500);

      expect(results.length).toBeGreaterThanOrEqual(1);
      if (results.length > 0) {
        const ev = results[0];
        // SGA OUT should lower OKC's probability
        expect(ev.estimatedTrueProb).toBeLessThan(market.yesPrice);
        expect(ev.edge).not.toBe(0);
        expect(ev.recommendedSize).toBeGreaterThan(0);
        expect(ev.recommendedSize).toBeLessThanOrEqual(50);
      }
    });

    it('should skip when edge is below minimum threshold', () => {
      const market = makeMarket(0.50);
      const signal: InjurySignal = {
        type: 'INJURY_ALPHA',
        injury: {
          playerName: 'Bench Player',
          team: 'OKC',
          status: 'PROBABLE',
          reason: 'Rest',
          source: 'ESPN',
          detectedAt: Date.now(),
          isNew: true,
        },
        affectedMarkets: [market],
        priceImpactEstimate: 0.005, // tiny impact
        confidence: 0.30,
        timestamp: Date.now(),
      };

      const results = calculator.evaluate(signal, 500);

      // Edge should be below 3% threshold, so no results
      expect(results).toHaveLength(0);
    });

    it('should cap position size at maxPositionSize', () => {
      const market = makeMarket(0.50);
      const signal: InjurySignal = {
        type: 'INJURY_ALPHA',
        injury: {
          playerName: 'Nikola Jokic',
          team: 'OKC',
          status: 'OUT',
          reason: 'Injury',
          source: 'ESPN',
          detectedAt: Date.now(),
          isNew: true,
        },
        affectedMarkets: [market],
        priceImpactEstimate: 0.17,
        confidence: 0.90,
        timestamp: Date.now(),
      };

      // Large bankroll should still cap at $50
      const results = calculator.evaluate(signal, 100000);

      for (const ev of results) {
        expect(ev.recommendedSize).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('momentum lag EV', () => {
    it('should produce a positive edge for lagged markets', () => {
      const laggedMarket = makeMarket(0.60);
      const signal: MomentumLagSignal = {
        type: 'MOMENTUM_LAG',
        leaderMarket: {
          marketId: 'leader',
          question: 'Will OKC win Game 5?',
          previousPrice: 0.55,
          currentPrice: 0.65,
          delta: 0.10,
          deltaPercent: 0.182,
          timestamp: Date.now(),
        },
        laggedMarkets: [laggedMarket],
        expectedCorrection: 0.06,
        confidence: 0.68,
        timestamp: Date.now(),
      };

      const results = calculator.evaluate(signal, 500);

      expect(results.length).toBeGreaterThanOrEqual(1);
      if (results.length > 0) {
        expect(results[0].edge).toBeGreaterThan(0);
        expect(results[0].estimatedTrueProb).toBeGreaterThan(laggedMarket.yesPrice);
      }
    });
  });
});

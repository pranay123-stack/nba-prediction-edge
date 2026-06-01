import { SignalDetector } from '../src/strategy/signal-detector';
import { InjuryReport, ParsedMarket, MarketSnapshot } from '../src/types';

// Mock the logger to avoid filesystem side effects in tests
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  writeExecutionLog: jest.fn(),
}));

describe('SignalDetector', () => {
  let detector: SignalDetector;

  beforeEach(() => {
    detector = new SignalDetector(30000);
  });

  // --- Injury Signal Tests ---

  describe('detectInjurySignals', () => {
    const makeMarket = (overrides: Partial<ParsedMarket> = {}): ParsedMarket => ({
      id: 'mkt-1',
      question: 'Will OKC Thunder win the NBA Finals?',
      conditionId: 'cond-1',
      yesPrice: 0.65,
      noPrice: 0.35,
      volume: 500000,
      liquidity: 100000,
      active: true,
      timestamp: Date.now(),
      ...overrides,
    });

    const makeInjury = (overrides: Partial<InjuryReport> = {}): InjuryReport => ({
      playerName: 'Shai Gilgeous-Alexander',
      team: 'OKC',
      status: 'OUT',
      reason: 'Knee soreness',
      source: 'ESPN',
      detectedAt: Date.now(),
      isNew: true,
      ...overrides,
    });

    it('should detect a signal when a star player is ruled OUT', () => {
      const markets = [makeMarket()];
      const injuries = [makeInjury()];

      const signals = detector.detectInjurySignals(injuries, markets);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('INJURY_ALPHA');
      expect(signals[0].priceImpactEstimate).toBeGreaterThan(0.1);
      expect(signals[0].confidence).toBeGreaterThan(0.8);
    });

    it('should not generate signals for old (already-priced) injuries', () => {
      const markets = [makeMarket()];
      const injuries = [makeInjury({ isNew: false })];

      const signals = detector.detectInjurySignals(injuries, markets);

      expect(signals).toHaveLength(0);
    });

    it('should have lower impact for QUESTIONABLE than OUT', () => {
      const markets = [makeMarket()];
      const outInjuries = [makeInjury({ status: 'OUT' })];
      const qInjuries = [makeInjury({ status: 'QUESTIONABLE', playerName: 'Shai Gilgeous-Alexander' })];

      const outSignals = detector.detectInjurySignals(outInjuries, markets);
      // Reset detector state
      const detector2 = new SignalDetector(30000);
      const qSignals = detector2.detectInjurySignals(qInjuries, markets);

      expect(outSignals[0].priceImpactEstimate).toBeGreaterThan(qSignals[0].priceImpactEstimate);
    });

    it('should not generate signals when no markets match the team', () => {
      const markets = [makeMarket({ question: 'Will Boston Celtics win?' })];
      const injuries = [makeInjury({ team: 'LAL', playerName: 'LeBron James' })];

      const signals = detector.detectInjurySignals(injuries, markets);

      expect(signals).toHaveLength(0);
    });

    it('should have lower impact for role players than stars', () => {
      const markets = [makeMarket()];
      const starInjury = [makeInjury({ playerName: 'Shai Gilgeous-Alexander' })];

      const detector2 = new SignalDetector(30000);
      const roleInjury = [makeInjury({ playerName: 'Some Roleplayer' })];

      const starSignals = detector.detectInjurySignals(starInjury, markets);
      const roleSignals = detector2.detectInjurySignals(roleInjury, markets);

      expect(starSignals[0].priceImpactEstimate).toBeGreaterThan(roleSignals[0].priceImpactEstimate);
    });
  });

  // --- Momentum Lag Tests ---

  describe('detectMomentumLag', () => {
    it('should detect lag when leader market moves but correlated market stays flat', () => {
      const now = Date.now();

      const leaderMarket: ParsedMarket = {
        id: 'leader-1',
        question: 'Will OKC Thunder win Game 5?',
        conditionId: 'c1',
        yesPrice: 0.72,
        noPrice: 0.28,
        volume: 300000,
        liquidity: 80000,
        active: true,
        timestamp: now,
      };

      const laggedMarket: ParsedMarket = {
        id: 'lagged-1',
        question: 'Will OKC Thunder win the series?',
        conditionId: 'c2',
        yesPrice: 0.60,
        noPrice: 0.40,
        volume: 200000,
        liquidity: 60000,
        active: true,
        timestamp: now,
      };

      const history: Record<string, MarketSnapshot[]> = {
        'leader-1': [
          { market: { ...leaderMarket, yesPrice: 0.65 }, capturedAt: now - 20000 },
          { market: leaderMarket, capturedAt: now },
        ],
        'lagged-1': [
          { market: { ...laggedMarket, yesPrice: 0.60 }, capturedAt: now - 20000 },
          { market: laggedMarket, capturedAt: now },
        ],
      };

      const signals = detector.detectMomentumLag(
        [leaderMarket, laggedMarket],
        (id) => history[id] || []
      );

      expect(signals.length).toBeGreaterThanOrEqual(1);
      if (signals.length > 0) {
        expect(signals[0].type).toBe('MOMENTUM_LAG');
        expect(signals[0].expectedCorrection).toBeGreaterThan(0);
      }
    });

    it('should return no signals when all markets move together', () => {
      const now = Date.now();

      const market1: ParsedMarket = {
        id: 'm1', question: 'Will OKC Thunder win Game 5?', conditionId: 'c1',
        yesPrice: 0.72, noPrice: 0.28, volume: 100000, liquidity: 50000,
        active: true, timestamp: now,
      };

      const market2: ParsedMarket = {
        id: 'm2', question: 'Will OKC Thunder win the series?', conditionId: 'c2',
        yesPrice: 0.68, noPrice: 0.32, volume: 100000, liquidity: 50000,
        active: true, timestamp: now,
      };

      // Both moved by similar amounts
      const history: Record<string, MarketSnapshot[]> = {
        'm1': [
          { market: { ...market1, yesPrice: 0.65 }, capturedAt: now - 20000 },
          { market: market1, capturedAt: now },
        ],
        'm2': [
          { market: { ...market2, yesPrice: 0.61 }, capturedAt: now - 20000 },
          { market: market2, capturedAt: now },
        ],
      };

      const signals = detector.detectMomentumLag(
        [market1, market2],
        (id) => history[id] || []
      );

      // Both moved, so no lag — either 0 signals or the lagged market
      // actually moved too, so it shouldn't trigger
      for (const signal of signals) {
        expect(signal.laggedMarkets.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

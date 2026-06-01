import { RiskManager } from '../src/strategy/risk-manager';
import { TradeDecision, TradeResult, EVCalculation, InjurySignal } from '../src/types';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  writeExecutionLog: jest.fn(),
}));

describe('RiskManager', () => {
  let risk: RiskManager;

  beforeEach(() => {
    // $50 max position, 15% stop loss, $200 daily limit, 52% min win rate
    risk = new RiskManager(50, 0.15, 200, 0.52);
  });

  const makeDummySignal = (): InjurySignal => ({
    type: 'INJURY_ALPHA',
    injury: {
      playerName: 'Test', team: 'TST', status: 'OUT',
      reason: 'Test', source: 'test', detectedAt: Date.now(), isNew: true,
    },
    affectedMarkets: [],
    priceImpactEstimate: 0.1,
    confidence: 0.8,
    timestamp: Date.now(),
  });

  const makeDummyEV = (): EVCalculation => ({
    signal: makeDummySignal(),
    estimatedTrueProb: 0.7,
    marketPrice: 0.6,
    edge: 0.1,
    kellyFraction: 0.05,
    recommendedSize: 25,
    expectedProfit: 2.5,
  });

  const makeDecision = (size: number): TradeDecision => ({
    action: 'BUY_YES',
    marketId: 'mkt-1',
    question: 'Test market?',
    side: 'YES',
    size,
    price: 0.6,
    ev: makeDummyEV(),
    reason: 'test',
    timestamp: Date.now(),
  });

  const makeResult = (): TradeResult => ({
    success: true,
    marketId: 'mkt-1',
    side: 'YES',
    size: 25,
    fillPrice: 0.61,
    slippage: 0.01,
    dryRun: true,
    timestamp: Date.now(),
  });

  it('should allow trades within position limits', () => {
    const check = risk.canTrade(makeDecision(25));
    expect(check.allowed).toBe(true);
  });

  it('should block trades exceeding max position size', () => {
    const check = risk.canTrade(makeDecision(100));
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('exceeds max');
  });

  it('should pause when daily loss limit is hit', () => {
    // Simulate a series of losses
    for (let i = 0; i < 8; i++) {
      risk.recordTrade(makeResult(), -30);
    }

    const check = risk.canTrade(makeDecision(25));
    expect(check.allowed).toBe(false);
    expect(risk.getState().isPaused).toBe(true);
  });

  it('should pause when win rate drops below threshold after enough trades', () => {
    // 10 trades, only 4 wins (40% < 52% threshold)
    for (let i = 0; i < 4; i++) {
      risk.recordTrade(makeResult(), 5);
    }
    for (let i = 0; i < 6; i++) {
      risk.recordTrade(makeResult(), -3);
    }

    const state = risk.getState();
    expect(state.isPaused).toBe(true);
    expect(state.pauseReason).toContain('Win rate');
  });

  it('should track win rate accurately', () => {
    risk.recordTrade(makeResult(), 10);
    risk.recordTrade(makeResult(), -5);
    risk.recordTrade(makeResult(), 8);

    const state = risk.getState();
    expect(state.totalTrades).toBe(3);
    expect(state.wins).toBe(2);
    expect(state.losses).toBe(1);
    expect(state.winRate).toBeCloseTo(2 / 3);
  });

  it('should reset daily counters', () => {
    risk.recordTrade(makeResult(), -50);
    risk.resetDaily();

    const state = risk.getState();
    expect(state.dailyPnL).toBe(0);
    expect(state.isPaused).toBe(false);
  });

  it('should compute performance summary', () => {
    risk.recordTrade(makeResult(), 15);
    risk.recordTrade(makeResult(), -5);

    const summary = risk.getPerformanceSummary();
    expect(summary.totalPnL).toBe(10);
    expect(summary.winRate).toBe(0.5);
    expect(summary.avgEdge).toBe(5);
  });
});

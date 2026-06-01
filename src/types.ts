// Shared type definitions for the entire pipeline

// --- Market Data Types ---

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  endDate: string;
  active: boolean;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string; // JSON string: "[\"0.65\",\"0.35\"]"
  outcomes: string;      // JSON string: "[\"Yes\",\"No\"]"
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  startDate: string;
  endDate: string;
}

export interface ParsedMarket {
  id: string;
  question: string;
  conditionId: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  active: boolean;
  timestamp: number;
}

export interface MarketSnapshot {
  market: ParsedMarket;
  capturedAt: number;
}

// --- Injury / News Signal Types ---

export interface InjuryReport {
  playerName: string;
  team: string;
  status: 'OUT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'PROBABLE' | 'UPGRADED' | 'UNKNOWN';
  reason: string;
  source: string;
  detectedAt: number;
  isNew: boolean; // true if this is a fresh report not yet priced in
}

export interface InjurySignal {
  type: 'INJURY_ALPHA';
  injury: InjuryReport;
  affectedMarkets: ParsedMarket[];
  priceImpactEstimate: number; // estimated odds shift magnitude
  confidence: number;          // 0-1
  timestamp: number;
}

// --- Momentum / Cross-Market Signal Types ---

export interface PriceMovement {
  marketId: string;
  question: string;
  previousPrice: number;
  currentPrice: number;
  delta: number;       // absolute price change
  deltaPercent: number; // percentage change
  timestamp: number;
}

export interface MomentumLagSignal {
  type: 'MOMENTUM_LAG';
  leaderMarket: PriceMovement;   // the market that moved first
  laggedMarkets: ParsedMarket[]; // markets that haven't adjusted yet
  expectedCorrection: number;     // expected price move in lagged markets
  confidence: number;
  timestamp: number;
}

// --- Unified Signal ---

export type TradingSignal = InjurySignal | MomentumLagSignal;

// --- Expected Value & Decision ---

export interface EVCalculation {
  signal: TradingSignal;
  estimatedTrueProb: number;  // our estimate of the true probability
  marketPrice: number;        // current market price (implied prob)
  edge: number;               // estimatedTrueProb - marketPrice
  kellyFraction: number;      // optimal bet size as fraction of bankroll
  recommendedSize: number;    // clamped position size in USD
  expectedProfit: number;     // edge * recommendedSize
}

export interface TradeDecision {
  action: 'BUY_YES' | 'BUY_NO' | 'SKIP';
  marketId: string;
  question: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
  ev: EVCalculation;
  reason: string;
  timestamp: number;
}

// --- Execution & Logging ---

export type ExecutionPhase =
  | 'DATA_FETCH'
  | 'SIGNAL_DETECTION'
  | 'EV_CALCULATION'
  | 'DECISION'
  | 'EXECUTION'
  | 'RISK_CHECK';

export interface ExecutionLog {
  timestamp: string;
  phase: ExecutionPhase;
  signal: string;
  action: string;
  result: Record<string, unknown>;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  marketId: string;
  side: 'YES' | 'NO';
  size: number;
  fillPrice: number;
  slippage: number;
  dryRun: boolean;
  timestamp: number;
}

// --- Risk Management ---

export interface RiskState {
  dailyPnL: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  openPositions: number;
  isPaused: boolean;
  pauseReason?: string;
}

// --- Configuration ---

export interface AppConfig {
  dryRun: boolean;
  polymarketApiUrl: string;
  polymarketClobUrl: string;
  polygonRpcUrl: string;
  privateKey: string;
  maxPositionSize: number;
  stopLossThreshold: number;
  dailyLossLimit: number;
  minWinRateThreshold: number;
  minEdgeThreshold: number;
  momentumLagWindowMs: number;
  injuryPollIntervalMs: number;
  signalCooldownMs: number;
}

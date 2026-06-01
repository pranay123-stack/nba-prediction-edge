import { TradeDecision, TradeResult } from '../types';
import { logger, writeExecutionLog } from '../utils/logger';

// Executes trade decisions against Polymarket.
// In dry-run mode (default), simulates execution with realistic latency
// and slippage modeling. In live mode, would submit orders via the CLOB API.
export class Executor {
  private readonly dryRun: boolean;
  private readonly clobUrl: string;

  constructor(dryRun: boolean, clobUrl: string) {
    this.dryRun = dryRun;
    this.clobUrl = clobUrl;
  }

  // Executes a trade decision and returns the result
  async execute(decision: TradeDecision): Promise<TradeResult> {
    if (decision.action === 'SKIP') {
      return this.skipResult(decision);
    }

    if (this.dryRun) {
      return this.simulateExecution(decision);
    }

    return this.liveExecution(decision);
  }

  // Simulates execution with realistic slippage and a fake tx hash.
  // Logs the full trade lifecycle for the demo.
  private async simulateExecution(decision: TradeDecision): Promise<TradeResult> {
    // Simulate network latency (50-200ms)
    const latency = 50 + Math.random() * 150;
    await new Promise(resolve => setTimeout(resolve, latency));

    // Simulate slippage: 0.1% to 1.5% depending on size
    const slippageBps = 10 + Math.random() * 140;
    const slippage = slippageBps / 10000;
    const fillPrice = decision.side === 'YES'
      ? decision.price * (1 + slippage)
      : decision.price * (1 - slippage);

    const result: TradeResult = {
      success: true,
      txHash: `0x${this.randomHex(64)}`,
      marketId: decision.marketId,
      side: decision.side,
      size: decision.size,
      fillPrice: Math.round(fillPrice * 10000) / 10000,
      slippage: Math.round(slippage * 10000) / 10000,
      dryRun: true,
      timestamp: Date.now(),
    };

    logger.info(
      `EXECUTED (dry-run): ${decision.action} | Market: ${decision.question.slice(0, 40)}... | ` +
      `$${decision.size} @ ${(fillPrice * 100).toFixed(2)}¢ | ` +
      `Slippage: ${(slippage * 100).toFixed(2)}% | Latency: ${latency.toFixed(0)}ms`
    );

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'EXECUTION',
      signal: decision.ev.signal.type,
      action: 'trade_executed',
      result: {
        dryRun: true,
        action: decision.action,
        marketId: decision.marketId,
        side: decision.side,
        size: decision.size,
        requestedPrice: decision.price,
        fillPrice: result.fillPrice,
        slippage: result.slippage,
        latencyMs: Math.round(latency),
        txHash: result.txHash,
      },
    });

    return result;
  }

  // Placeholder for live execution via Polymarket CLOB API.
  // Would use ethers.js to sign and submit limit orders.
  private async liveExecution(decision: TradeDecision): Promise<TradeResult> {
    logger.warn('LIVE EXECUTION not implemented — falling back to dry-run');
    return this.simulateExecution(decision);
  }

  private skipResult(decision: TradeDecision): TradeResult {
    return {
      success: false,
      marketId: decision.marketId,
      side: decision.side,
      size: 0,
      fillPrice: 0,
      slippage: 0,
      dryRun: this.dryRun,
      timestamp: Date.now(),
    };
  }

  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * 16)];
    }
    return result;
  }
}

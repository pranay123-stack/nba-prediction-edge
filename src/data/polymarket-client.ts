import axios, { AxiosInstance } from 'axios';
import { PolymarketEvent, PolymarketMarket, ParsedMarket, MarketSnapshot } from '../types';
import { logger, writeExecutionLog } from '../utils/logger';
import { withRetry } from '../utils/retry';

// Client for Polymarket's Gamma API — fetches NBA Playoffs prediction markets
// and converts raw API responses into typed, numeric ParsedMarket objects.
export class PolymarketClient {
  private api: AxiosInstance;
  private priceHistory: Map<string, MarketSnapshot[]> = new Map();

  constructor(baseUrl: string) {
    this.api = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: { 'Accept': 'application/json' },
    });
  }

  // NBA-related search terms for filtering Polymarket events
  private static readonly NBA_KEYWORDS = [
    'nba', 'thunder', 'knicks', 'celtics', 'nuggets', 'cavaliers',
    'pacers', 'mavericks', 'timberwolves', 'warriors', 'lakers',
    'bucks', 'heat', 'suns', 'clippers', 'spurs', 'rockets',
    'grizzlies', 'playoffs', 'finals',
  ];

  // Fetches all active NBA Playoffs markets from the Gamma API.
  // The Gamma API doesn't reliably filter by tag, so we fetch
  // high-volume events and filter for NBA-related titles client-side.
  async fetchNBAPlayoffMarkets(): Promise<ParsedMarket[]> {
    const result = await withRetry(async () => {
      const response = await this.api.get('/events', {
        params: {
          active: true,
          closed: false,
          order: 'volume24hr',
          ascending: false,
          limit: 100,
        },
      });
      const allEvents = response.data as PolymarketEvent[];
      // Filter to NBA-related events
      return allEvents.filter(e => {
        const title = (e.title || '').toLowerCase();
        return PolymarketClient.NBA_KEYWORDS.some(kw => title.includes(kw));
      });
    }, 'polymarket-fetch-events');

    if (!result) {
      logger.warn('Failed to fetch Polymarket events — returning empty list');
      writeExecutionLog({
        timestamp: new Date().toISOString(),
        phase: 'DATA_FETCH',
        signal: 'polymarket',
        action: 'fetch_events',
        result: { success: false, reason: 'all retries failed' },
      });
      return [];
    }

    const markets = this.parseEvents(result);

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'DATA_FETCH',
      signal: 'polymarket',
      action: 'fetch_events',
      result: { success: true, marketCount: markets.length },
    });

    // Store snapshots for momentum tracking
    const now = Date.now();
    for (const market of markets) {
      const history = this.priceHistory.get(market.id) || [];
      history.push({ market, capturedAt: now });
      // Keep only last 20 snapshots per market to bound memory
      if (history.length > 20) history.shift();
      this.priceHistory.set(market.id, history);
    }

    return markets;
  }

  // Returns the stored price history for a market, used by momentum detector
  getPriceHistory(marketId: string): MarketSnapshot[] {
    return this.priceHistory.get(marketId) || [];
  }

  // Returns all market IDs with stored history
  getTrackedMarketIds(): string[] {
    return Array.from(this.priceHistory.keys());
  }

  // Converts raw Polymarket API events into flat ParsedMarket objects
  private parseEvents(events: PolymarketEvent[]): ParsedMarket[] {
    const markets: ParsedMarket[] = [];

    for (const event of events) {
      if (!event.markets) continue;

      for (const raw of event.markets) {
        const parsed = this.parseMarket(raw);
        if (parsed) markets.push(parsed);
      }
    }

    return markets;
  }

  // Parses a single market's outcome prices from the JSON string format
  private parseMarket(raw: PolymarketMarket): ParsedMarket | null {
    try {
      const prices: string[] = JSON.parse(raw.outcomePrices || '[]');
      const yesPrice = parseFloat(prices[0] || '0');
      const noPrice = parseFloat(prices[1] || '0');

      if (yesPrice === 0 && noPrice === 0) return null;

      return {
        id: raw.id,
        question: raw.question,
        conditionId: raw.conditionId,
        yesPrice,
        noPrice,
        volume: parseFloat(raw.volume || '0'),
        liquidity: parseFloat(raw.liquidity || '0'),
        active: raw.active && !raw.closed,
        timestamp: Date.now(),
      };
    } catch {
      logger.warn(`Failed to parse market ${raw.id}: invalid price data`);
      return null;
    }
  }
}

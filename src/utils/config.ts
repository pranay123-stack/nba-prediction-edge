import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

// Loads configuration from environment variables with sensible defaults for dry-run mode
export function loadConfig(): AppConfig {
  return {
    dryRun: process.env.DRY_RUN !== 'false',
    polymarketApiUrl: process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com',
    polymarketClobUrl: process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com',
    polygonRpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    privateKey: process.env.PRIVATE_KEY || '',
    maxPositionSize: Number(process.env.MAX_POSITION_SIZE_USD) || 50,
    stopLossThreshold: Number(process.env.STOP_LOSS_THRESHOLD) || 0.15,
    dailyLossLimit: Number(process.env.DAILY_LOSS_LIMIT_USD) || 200,
    minWinRateThreshold: Number(process.env.MIN_WIN_RATE_THRESHOLD) || 0.52,
    minEdgeThreshold: Number(process.env.MIN_EDGE_THRESHOLD) || 0.03,
    momentumLagWindowMs: Number(process.env.MOMENTUM_LAG_WINDOW_MS) || 30000,
    injuryPollIntervalMs: Number(process.env.INJURY_POLL_INTERVAL_MS) || 15000,
    signalCooldownMs: Number(process.env.SIGNAL_COOLDOWN_MS) || 60000,
  };
}

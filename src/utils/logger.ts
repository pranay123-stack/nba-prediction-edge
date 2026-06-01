import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { ExecutionLog } from '../types';

const LOG_DIR = path.resolve(process.cwd(), '.canon', 'execution');

// Ensures the execution log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Winston logger for console output with timestamps
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Appends a structured execution log entry to the current run's JSON log file
export function writeExecutionLog(entry: ExecutionLog): void {
  const runFile = path.join(LOG_DIR, `run-${getRunId()}.json`);

  let entries: ExecutionLog[] = [];
  if (fs.existsSync(runFile)) {
    try {
      entries = JSON.parse(fs.readFileSync(runFile, 'utf-8'));
    } catch {
      entries = [];
    }
  }

  entries.push(entry);
  fs.writeFileSync(runFile, JSON.stringify(entries, null, 2));
}

// Generates a run ID based on the current date-hour so logs group per session
let cachedRunId: string | null = null;
function getRunId(): string {
  if (!cachedRunId) {
    const now = new Date();
    cachedRunId = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
  }
  return cachedRunId;
}

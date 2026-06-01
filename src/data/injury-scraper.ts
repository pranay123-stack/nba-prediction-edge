import axios from 'axios';
import * as cheerio from 'cheerio';
import { InjuryReport } from '../types';
import { logger, writeExecutionLog } from '../utils/logger';
import { withRetry } from '../utils/retry';

// NBA injury status keywords mapped to our typed status enum
const STATUS_MAP: Record<string, InjuryReport['status']> = {
  'out': 'OUT',
  'doubtful': 'DOUBTFUL',
  'questionable': 'QUESTIONABLE',
  'probable': 'PROBABLE',
  'upgraded': 'UPGRADED',
  'available': 'PROBABLE',
  'day-to-day': 'QUESTIONABLE',
};

// Scrapes injury reports from publicly available NBA news sources.
// Tracks previously seen reports so we can flag NEW injuries that
// haven't been priced into prediction markets yet.
export class InjuryScraper {
  private previousReports: Map<string, InjuryReport> = new Map();
  private readonly ESPN_INJURIES_URL = 'https://www.espn.com/nba/injuries';
  private readonly NBA_INJURIES_URL = 'https://www.nba.com/players/injuries';

  // Fetches injury data and returns only NEW or CHANGED reports
  async scrapeLatest(): Promise<InjuryReport[]> {
    const reports = await this.fetchFromESPN();

    writeExecutionLog({
      timestamp: new Date().toISOString(),
      phase: 'DATA_FETCH',
      signal: 'injury-scraper',
      action: 'scrape_injuries',
      result: {
        success: reports.length > 0,
        totalReports: reports.length,
        newReports: reports.filter(r => r.isNew).length,
      },
    });

    return reports;
  }

  // Parses ESPN's injury page for player status updates
  private async fetchFromESPN(): Promise<InjuryReport[]> {
    const html = await withRetry(async () => {
      const response = await axios.get(this.ESPN_INJURIES_URL, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NBAInjuryTracker/1.0)',
          'Accept': 'text/html',
        },
      });
      return response.data as string;
    }, 'espn-injury-fetch');

    if (!html) {
      logger.warn('ESPN injury page unavailable — falling back to cached data');
      return this.getFallbackReports();
    }

    return this.parseESPNHtml(html);
  }

  // Extracts structured injury data from the ESPN HTML page
  private parseESPNHtml(html: string): InjuryReport[] {
    const $ = cheerio.load(html);
    const reports: InjuryReport[] = [];
    const now = Date.now();

    // ESPN structures injuries by team in tables
    $('table tbody tr').each((_index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const playerName = $(cells[0]).text().trim();
      const statusText = $(cells[1]).text().trim().toLowerCase();
      const reason = $(cells[2]).text().trim();

      if (!playerName || !statusText) return;

      // Detect the team from the closest preceding header
      const teamHeader = $(row).closest('table').prev('h2, h3').text().trim();
      const team = this.normalizeTeamName(teamHeader);
      const status = this.parseStatus(statusText);

      const key = `${playerName}-${team}`;
      const previous = this.previousReports.get(key);

      // Mark as new if we haven't seen it or the status changed
      const isNew = !previous || previous.status !== status;

      const report: InjuryReport = {
        playerName,
        team,
        status,
        reason,
        source: 'ESPN',
        detectedAt: now,
        isNew,
      };

      this.previousReports.set(key, report);
      reports.push(report);
    });

    return reports;
  }

  // Converts raw status text into our typed enum
  private parseStatus(text: string): InjuryReport['status'] {
    for (const [keyword, status] of Object.entries(STATUS_MAP)) {
      if (text.includes(keyword)) return status;
    }
    return 'UNKNOWN';
  }

  // Normalizes team names to abbreviation format (e.g., "Boston Celtics" → "BOS")
  private normalizeTeamName(raw: string): string {
    const TEAM_ABBREVS: Record<string, string> = {
      'celtics': 'BOS', 'nets': 'BKN', 'knicks': 'NYK', '76ers': 'PHI',
      'raptors': 'TOR', 'bulls': 'CHI', 'cavaliers': 'CLE', 'pistons': 'DET',
      'pacers': 'IND', 'bucks': 'MIL', 'hawks': 'ATL', 'hornets': 'CHA',
      'heat': 'MIA', 'magic': 'ORL', 'wizards': 'WAS', 'nuggets': 'DEN',
      'timberwolves': 'MIN', 'thunder': 'OKC', 'trail blazers': 'POR',
      'jazz': 'UTA', 'warriors': 'GSW', 'clippers': 'LAC', 'lakers': 'LAL',
      'suns': 'PHX', 'kings': 'SAC', 'mavericks': 'DAL', 'rockets': 'HOU',
      'grizzlies': 'MEM', 'pelicans': 'NOP', 'spurs': 'SAS',
    };

    const lower = raw.toLowerCase();
    for (const [name, abbrev] of Object.entries(TEAM_ABBREVS)) {
      if (lower.includes(name)) return abbrev;
    }
    return raw.toUpperCase().slice(0, 3);
  }

  // Returns placeholder reports during dry-run when live scraping fails
  private getFallbackReports(): InjuryReport[] {
    return [];
  }
}

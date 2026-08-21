/**
 * Activity Logger - Event logging for yardmaster operations
 * Zero Mock Policy: Real file I/O only, no console.log fallbacks
 */

import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

export interface LogEntry {
  timestamp: string;
  event: 'register' | 'release' | 'tunnel_created' | 'tunnel_closed' | 'error';
  app?: string;
  port?: number;
  url?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export type LogWriteResult =
  | { status: 'written' }
  | { status: 'degraded'; error: string };

export class Logger {
  private logPath: string;
  private initialized: boolean;

  constructor(logPath = join(homedir(), '.yardmaster', 'logs', 'activity.log')) {
    this.logPath = logPath;
    this.initialized = false;
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const logDir = dirname(this.logPath);
    if (!existsSync(logDir)) {
      await mkdir(logDir, { recursive: true });
    }

    this.initialized = true;
  }

  /**
   * Log an event to the activity log
   * @param event - Event type
   * @param data - Event data
   */
  async logEvent(
    event: LogEntry['event'],
    data: Omit<LogEntry, 'timestamp' | 'event'>
  ): Promise<LogWriteResult> {
    try {
      await this.ensureLogDirectory();

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        event,
        ...data
      };

      // Write as JSON Lines format (one JSON object per line)
      const line = JSON.stringify(entry) + '\n';
      await appendFile(this.logPath, line, 'utf-8');
      return { status: 'written' };
    } catch (error) {
      // Don't throw - logging failures should not crash the application
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'degraded',
        error: `Failed to write activity log '${this.logPath}': ${message}`
      };
    }
  }

  /**
   * Log port registration
   */
  async logRegister(
    appName: string,
    port: number,
    ngrokUrl?: string
  ): Promise<LogWriteResult> {
    return await this.logEvent('register', {
      app: appName,
      port,
      url: ngrokUrl,
      details: { success: true }
    });
  }

  /**
   * Log port release
   */
  async logRelease(appName: string, port: number): Promise<LogWriteResult> {
    return await this.logEvent('release', {
      app: appName,
      port,
      details: { success: true }
    });
  }

  /**
   * Log tunnel creation
   */
  async logTunnelCreated(
    appName: string,
    port: number,
    url: string
  ): Promise<LogWriteResult> {
    return await this.logEvent('tunnel_created', {
      app: appName,
      port,
      url,
      details: { success: true }
    });
  }

  /**
   * Log tunnel closure
   */
  async logTunnelClosed(appName: string, port: number): Promise<LogWriteResult> {
    return await this.logEvent('tunnel_closed', {
      app: appName,
      port,
      details: { success: true }
    });
  }

  /**
   * Log error
   */
  async logError(
    message: string,
    appName?: string,
    port?: number,
    details?: Record<string, unknown>
  ): Promise<LogWriteResult> {
    return await this.logEvent('error', {
      app: appName,
      port,
      message,
      details: { ...details, success: false }
    });
  }
}

// Export singleton instance
export const logger = new Logger();

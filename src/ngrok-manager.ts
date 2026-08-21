/**
 * NgrokManager - Tunnel lifecycle management using real ngrok SDK
 * Zero Mock Policy: Real ngrok integration only, no mocks
 */

import ngrok, { type Listener } from '@ngrok/ngrok';
import {
  logger as defaultLogger,
  type Logger,
  type LogWriteResult
} from './logger.js';
import type { Config, TunnelInfo } from './types/index.js';

export interface NgrokForwardOptions {
  addr: number;
  authtoken: string;
  metadata?: string;
  domain?: string;
  basic_auth?: string | string[];
  ip_restriction_allow_cidrs?: string | string[];
  ip_restriction_deny_cidrs?: string | string[];
}

interface ActiveTunnel {
  app_name: string;
  port: number;
  url: string;
  listener: Listener;
}

export interface NgrokSdk {
  authtoken(authToken: string): Promise<void>;
  forward(options: NgrokForwardOptions): Promise<Listener>;
}

export interface TunnelCreationResult {
  url: string;
  activity_log: LogWriteResult | null;
}

export interface TunnelCloseResult {
  closed: boolean;
  activity_log: LogWriteResult | null;
}

export class NgrokOperationError extends Error {
  constructor(
    message: string,
    readonly activity_log: LogWriteResult
  ) {
    super(
      activity_log.status === 'degraded'
        ? `${message}; ${activity_log.error}`
        : message
    );
    this.name = 'NgrokOperationError';
  }
}

export class NgrokManager {
  private config: Config;
  private tunnels: Map<string, ActiveTunnel>;
  private initialized: boolean;
  private sdk: NgrokSdk;
  private activityLogger: Logger;

  constructor(
    config: Config,
    sdk: NgrokSdk = ngrok,
    activityLogger: Logger = defaultLogger
  ) {
    this.config = config;
    this.tunnels = new Map();
    this.initialized = false;
    this.sdk = sdk;
    this.activityLogger = activityLogger;
  }

  /**
   * Initialize ngrok with auth token
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.config.ngrok.auth_token) {
      throw new Error(
        'ngrok auth token is required to create tunnels. Set it in ~/.yardmaster/config.json or the NGROK_AUTH_TOKEN env var'
      );
    }

    try {
      // Set auth token from config
      await this.sdk.authtoken(this.config.ngrok.auth_token);
      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize ngrok: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a tunnel for a given port
   * @param port - Local port to tunnel
   * @param appName - Application name for labeling
   * @returns Public ngrok URL
   */
  async createTunnel(
    port: number,
    appName: string
  ): Promise<TunnelCreationResult> {
    await this.initialize();

    // Check if tunnel already exists for this app
    if (this.tunnels.has(appName)) {
      const existing = this.tunnels.get(appName)!;
      return { url: existing.url, activity_log: null };
    }

    try {
      // Create tunnel using ngrok SDK with properly typed options
      const forwardOptions: NgrokForwardOptions = {
        addr: port,
        authtoken: this.config.ngrok.auth_token,
        // Label the tunnel with app name for easier identification
        metadata: JSON.stringify({ app_name: appName, managed_by: 'yardmaster' })
      };

      // Add custom domain if configured
      if (this.config.ngrok.domain) {
        forwardOptions.domain = this.config.ngrok.domain;
      }

      // Add basic authentication if configured
      if (this.config.ngrok.basic_auth) {
        forwardOptions.basic_auth = this.config.ngrok.basic_auth;
      }

      // Add IP restrictions if configured
      if (this.config.ngrok.ip_allow && this.config.ngrok.ip_allow.length > 0) {
        forwardOptions.ip_restriction_allow_cidrs = this.config.ngrok.ip_allow;
      }

      if (this.config.ngrok.ip_deny && this.config.ngrok.ip_deny.length > 0) {
        forwardOptions.ip_restriction_deny_cidrs = this.config.ngrok.ip_deny;
      }

      const listener = await this.sdk.forward(forwardOptions);

      // Get the public URL
      const url = listener.url() || '';

      // Store tunnel info
      this.tunnels.set(appName, {
        app_name: appName,
        port,
        url,
        listener
      });

      // Log tunnel creation (additional log beyond registry's updateNgrokUrl)
      const activityLog = await this.activityLogger.logTunnelCreated(
        appName,
        port,
        url
      );

      return { url, activity_log: activityLog };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log tunnel creation error
      const activityLog = await this.activityLogger.logError(
        `Failed to create tunnel for ${appName}:${port}`,
        appName,
        port,
        { error: errorMessage }
      );

      throw new NgrokOperationError(
        `Failed to create tunnel for ${appName}:${port}: ${errorMessage}`,
        activityLog
      );
    }
  }

  /**
   * Close a tunnel by app name
   * @param appName - Application name
   */
  async closeTunnel(appName: string): Promise<TunnelCloseResult> {
    const tunnel = this.tunnels.get(appName);

    if (!tunnel) {
      // Not an error - tunnel may have already been closed
      return { closed: false, activity_log: null };
    }

    try {
      // Close the ngrok listener
      await tunnel.listener.close();

      // Log tunnel closure
      const activityLog = await this.activityLogger.logTunnelClosed(
        appName,
        tunnel.port
      );

      // Remove from active tunnels
      this.tunnels.delete(appName);
      return { closed: true, activity_log: activityLog };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log tunnel close error
      const activityLog = await this.activityLogger.logError(
        `Failed to close tunnel for ${appName}`,
        appName,
        tunnel.port,
        { error: errorMessage }
      );

      throw new NgrokOperationError(
        `Failed to close tunnel for ${appName}: ${errorMessage}`,
        activityLog
      );
    }
  }

  /**
   * Get tunnel URL for an app
   * @param appName - Application name
   * @returns Public URL or null if not found
   */
  getTunnelUrl(appName: string): string | null {
    const tunnel = this.tunnels.get(appName);
    return tunnel ? tunnel.url : null;
  }

  /**
   * List all active tunnels
   * @returns Array of tunnel info
   */
  listActiveTunnels(): TunnelInfo[] {
    return Array.from(this.tunnels.values()).map((tunnel) => ({
      app_name: tunnel.app_name,
      url: tunnel.url,
      port: tunnel.port
    }));
  }

  /**
   * Check if a tunnel exists for an app
   */
  hasTunnel(appName: string): boolean {
    return this.tunnels.has(appName);
  }

  /**
   * Graceful shutdown - close all tunnels
   */
  async shutdown(): Promise<void> {
    const closePromises: Promise<TunnelCloseResult>[] = [];

    for (const [appName] of this.tunnels) {
      closePromises.push(this.closeTunnel(appName));
    }

    try {
      await Promise.all(closePromises);
    } catch (error) {
      console.error('Error during ngrok shutdown:', error);
      throw error;
    }
  }

  /**
   * Get tunnel count
   */
  getTunnelCount(): number {
    return this.tunnels.size;
  }
}

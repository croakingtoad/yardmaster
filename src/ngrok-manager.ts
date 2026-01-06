/**
 * NgrokManager - Tunnel lifecycle management using real ngrok SDK
 * Zero Mock Policy: Real ngrok integration only, no mocks
 */

import ngrok from '@ngrok/ngrok';
import type { Config, TunnelInfo } from './types/index.js';

interface ActiveTunnel {
  app_name: string;
  port: number;
  url: string;
  listener: any; // ngrok listener object
}

export class NgrokManager {
  private config: Config;
  private tunnels: Map<string, ActiveTunnel>;
  private initialized: boolean;

  constructor(config: Config) {
    this.config = config;
    this.tunnels = new Map();
    this.initialized = false;
  }

  /**
   * Initialize ngrok with auth token
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Set auth token from config
      await ngrok.authtoken(this.config.ngrok.auth_token);
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
  async createTunnel(port: number, appName: string): Promise<string> {
    await this.initialize();

    // Check if tunnel already exists for this app
    if (this.tunnels.has(appName)) {
      const existing = this.tunnels.get(appName)!;
      return existing.url;
    }

    try {
      // Create tunnel using ngrok SDK
      const forwardOptions: any = {
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

      const listener = await ngrok.forward(forwardOptions);

      // Get the public URL
      const url = listener.url() || '';

      // Store tunnel info
      this.tunnels.set(appName, {
        app_name: appName,
        port,
        url,
        listener
      });

      return url;
    } catch (error) {
      throw new Error(
        `Failed to create tunnel for ${appName}:${port}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Close a tunnel by app name
   * @param appName - Application name
   */
  async closeTunnel(appName: string): Promise<void> {
    const tunnel = this.tunnels.get(appName);

    if (!tunnel) {
      // Not an error - tunnel may have already been closed
      return;
    }

    try {
      // Close the ngrok listener
      await tunnel.listener.close();

      // Remove from active tunnels
      this.tunnels.delete(appName);
    } catch (error) {
      throw new Error(
        `Failed to close tunnel for ${appName}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
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
    const closePromises: Promise<void>[] = [];

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

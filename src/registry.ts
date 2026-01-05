/**
 * PortRegistry - Core port management with persistent JSON storage
 * Zero Mock Policy: Real file I/O operations only
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';
import type {
  PortRegistration,
  RegistryData,
  Config,
  PortRegistrationResult,
  PortReleaseResult,
  PortQueryResult
} from './types/index.js';

export class PortRegistry {
  private registryPath: string;
  private data: RegistryData;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    // Expand ~ to home directory
    this.registryPath = config.registry.path.replace('~', homedir());
    this.data = {
      ports: {},
      version: '1.0.0',
      last_updated: new Date().toISOString()
    };
  }

  /**
   * Initialize registry - load from disk or create new
   */
  async initialize(): Promise<void> {
    try {
      await this.load();
    } catch (error) {
      // File doesn't exist, create new registry
      await this.ensureDirectory();
      await this.save();
    }
  }

  /**
   * Register a port for an application
   * @param appName - Name of the application
   * @param desiredPort - Optional specific port (will auto-assign if not provided)
   * @returns Registration result with port and status
   */
  async registerPort(
    appName: string,
    desiredPort?: number
  ): Promise<PortRegistrationResult> {
    // Check if app already registered
    const existing = Object.values(this.data.ports).find(
      (reg) => reg.app_name === appName && reg.status === 'active'
    );

    if (existing) {
      return {
        success: false,
        app_name: appName,
        port: existing.port,
        ngrok_url: existing.ngrok_url || '',
        message: `Application '${appName}' already registered on port ${existing.port}`
      };
    }

    // Determine port to use
    let port: number;
    if (desiredPort) {
      // Validate desired port
      if (!this.isValidPort(desiredPort)) {
        return {
          success: false,
          app_name: appName,
          port: desiredPort,
          ngrok_url: '',
          message: `Invalid port ${desiredPort}. Must be between 1024-65535`
        };
      }

      // Check if port is available
      if (!this.isPortAvailable(desiredPort)) {
        const occupant = this.data.ports[desiredPort];
        return {
          success: false,
          app_name: appName,
          port: desiredPort,
          ngrok_url: '',
          message: `Port ${desiredPort} already in use by '${occupant.app_name}'`
        };
      }

      port = desiredPort;
    } else {
      // Auto-assign port
      const availablePort = this.getAvailablePort();
      if (!availablePort) {
        return {
          success: false,
          app_name: appName,
          port: 0,
          ngrok_url: '',
          message: `No available ports in range ${this.config.port_range.start}-${this.config.port_range.end}`
        };
      }
      port = availablePort;
    }

    // Create registration
    const registration: PortRegistration = {
      app_name: appName,
      port,
      ngrok_url: null, // Will be set by ngrokManager
      pid: process.pid,
      registered_at: new Date().toISOString(),
      status: 'active'
    };

    this.data.ports[port] = registration;
    this.data.last_updated = new Date().toISOString();
    await this.save();

    return {
      success: true,
      app_name: appName,
      port,
      ngrok_url: '',
      message: `Port ${port} registered for '${appName}'`
    };
  }

  /**
   * Update ngrok URL for a registered port
   */
  async updateNgrokUrl(appName: string, ngrokUrl: string): Promise<void> {
    const registration = Object.values(this.data.ports).find(
      (reg) => reg.app_name === appName && reg.status === 'active'
    );

    if (registration) {
      registration.ngrok_url = ngrokUrl;
      this.data.last_updated = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Release a port registration
   */
  async releasePort(appName: string): Promise<PortReleaseResult> {
    const registration = Object.values(this.data.ports).find(
      (reg) => reg.app_name === appName && reg.status === 'active'
    );

    if (!registration) {
      return {
        success: false,
        app_name: appName,
        port: 0,
        message: `No active registration found for '${appName}'`
      };
    }

    // Mark as released (keep in registry for history)
    registration.status = 'released';
    registration.ngrok_url = null;
    this.data.last_updated = new Date().toISOString();
    await this.save();

    return {
      success: true,
      app_name: appName,
      port: registration.port,
      message: `Released port ${registration.port} from '${appName}'`
    };
  }

  /**
   * Query all registered ports
   */
  queryPorts(filter?: string): PortQueryResult {
    let registrations = Object.values(this.data.ports);

    // Filter by status (default to active only)
    registrations = registrations.filter((reg) => reg.status === 'active');

    // Apply additional filter if provided
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      registrations = registrations.filter(
        (reg) =>
          reg.app_name.toLowerCase().includes(lowerFilter) ||
          reg.port.toString().includes(lowerFilter)
      );
    }

    return {
      total: registrations.length,
      registrations
    };
  }

  /**
   * Get next available port in configured range
   */
  getAvailablePort(rangeStart?: number, rangeEnd?: number): number | null {
    const start = rangeStart || this.config.port_range.start;
    const end = rangeEnd || this.config.port_range.end;

    for (let port = start; port <= end; port++) {
      if (this.isPortAvailable(port)) {
        return port;
      }
    }

    return null;
  }

  /**
   * Check if a port is available
   */
  isPortAvailable(port: number): boolean {
    const registration = this.data.ports[port];
    return !registration || registration.status === 'released';
  }

  /**
   * Validate port number
   */
  isValidPort(port: number): boolean {
    return port >= 1024 && port <= 65535;
  }

  /**
   * Get registration by app name
   */
  getRegistrationByApp(appName: string): PortRegistration | null {
    return (
      Object.values(this.data.ports).find(
        (reg) => reg.app_name === appName && reg.status === 'active'
      ) || null
    );
  }

  /**
   * Get registration by port
   */
  getRegistrationByPort(port: number): PortRegistration | null {
    const registration = this.data.ports[port];
    return registration && registration.status === 'active'
      ? registration
      : null;
  }

  /**
   * Load registry from disk (real file I/O)
   */
  private async load(): Promise<void> {
    const content = await readFile(this.registryPath, 'utf-8');
    this.data = JSON.parse(content);
  }

  /**
   * Save registry to disk (real file I/O)
   */
  private async save(): Promise<void> {
    await this.ensureDirectory();
    const content = JSON.stringify(this.data, null, 2);
    await writeFile(this.registryPath, content, 'utf-8');
  }

  /**
   * Ensure registry directory exists
   */
  private async ensureDirectory(): Promise<void> {
    const dir = dirname(this.registryPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Get current registry data (for testing/debugging)
   */
  getData(): RegistryData {
    return { ...this.data };
  }
}

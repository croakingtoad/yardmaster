/**
 * PortRegistry - Core port management with persistent JSON storage
 * Zero Mock Policy: Real file I/O operations only
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname } from 'path';
import * as lockfile from 'proper-lockfile';
import {
  logger as defaultLogger,
  type Logger,
  type LogWriteResult
} from './logger.js';
import type {
  PortRegistration,
  RegistryData,
  Config,
  PortRegistrationResult,
  PortReleaseResult,
  PortQueryResult
} from './types/index.js';

interface MutationResult<T> {
  result: T;
  changed: boolean;
}

function isErrnoException(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

function isPortRegistration(value: unknown, key: string): value is PortRegistration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const monitorIsValid = !('monitor' in value) || typeof value.monitor === 'boolean';
  const securityIsValid =
    !('security' in value) ||
    (typeof value.security === 'object' &&
      value.security !== null &&
      !Array.isArray(value.security) &&
      'basic_auth' in value.security &&
      typeof value.security.basic_auth === 'boolean' &&
      'ip_restrictions' in value.security &&
      typeof value.security.ip_restrictions === 'boolean' &&
      'custom_domain' in value.security &&
      typeof value.security.custom_domain === 'boolean');

  return (
    'app_name' in value &&
    typeof value.app_name === 'string' &&
    'port' in value &&
    typeof value.port === 'number' &&
    Number.isInteger(value.port) &&
    value.port >= 1024 &&
    value.port <= 65535 &&
    String(value.port) === key &&
    'ngrok_url' in value &&
    (typeof value.ngrok_url === 'string' || value.ngrok_url === null) &&
    'pid' in value &&
    ((typeof value.pid === 'number' && Number.isInteger(value.pid)) ||
      value.pid === null) &&
    'registered_at' in value &&
    typeof value.registered_at === 'string' &&
    !Number.isNaN(Date.parse(value.registered_at)) &&
    'status' in value &&
    (value.status === 'active' || value.status === 'released') &&
    monitorIsValid &&
    securityIsValid
  );
}

function isRegistryData(value: unknown): value is RegistryData {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('ports' in value) ||
    typeof value.ports !== 'object' ||
    value.ports === null ||
    Array.isArray(value.ports) ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    value.version.length === 0 ||
    !('last_updated' in value) ||
    typeof value.last_updated !== 'string' ||
    Number.isNaN(Date.parse(value.last_updated))
  ) {
    return false;
  }

  return Object.entries(value.ports).every(([key, registration]) =>
    isPortRegistration(registration, key)
  );
}

export class PortRegistry {
  private registryPath: string;
  private data: RegistryData;
  private config: Config;
  private activityLogger: Logger;

  constructor(config: Config, activityLogger: Logger = defaultLogger) {
    this.config = config;
    this.activityLogger = activityLogger;
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
      if (!isErrnoException(error, 'ENOENT')) {
        throw error;
      }

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
    desiredPort?: number,
    monitor?: boolean
  ): Promise<PortRegistrationResult> {
    const result = await this.mutate((data) => {
      const existing = Object.values(data.ports).find(
        (reg) => reg.app_name === appName && reg.status === 'active'
      );

      if (existing) {
        return {
          changed: false,
          result: {
            success: false,
            app_name: appName,
            port: existing.port,
            ngrok_url: existing.ngrok_url || '',
            message: `Application '${appName}' already registered on port ${existing.port}`
          }
        };
      }

      let port: number;
      if (desiredPort) {
        if (!this.isValidPort(desiredPort)) {
          return {
            changed: false,
            result: {
              success: false,
              app_name: appName,
              port: desiredPort,
              ngrok_url: '',
              message: `Invalid port ${desiredPort}. Must be between 1024-65535`
            }
          };
        }

        if (!this.isPortAvailableIn(data, desiredPort)) {
          const occupant = data.ports[desiredPort];
          return {
            changed: false,
            result: {
              success: false,
              app_name: appName,
              port: desiredPort,
              ngrok_url: '',
              message: `Port ${desiredPort} already in use by '${occupant.app_name}'`
            }
          };
        }

        port = desiredPort;
      } else {
        const availablePort = this.getAvailablePortIn(data);
        if (!availablePort) {
          return {
            changed: false,
            result: {
              success: false,
              app_name: appName,
              port: 0,
              ngrok_url: '',
              message: `No available ports in range ${this.config.port_range.start}-${this.config.port_range.end}`
            }
          };
        }
        port = availablePort;
      }

      const registration: PortRegistration = {
        app_name: appName,
        port,
        ngrok_url: null,
        pid: process.pid,
        registered_at: new Date().toISOString(),
        status: 'active',
        monitor,
        security: {
          basic_auth: !!this.config.ngrok.basic_auth,
          ip_restrictions: !!(
            this.config.ngrok.ip_allow?.length || this.config.ngrok.ip_deny?.length
          ),
          custom_domain: !!this.config.ngrok.domain
        }
      };

      data.ports[port] = registration;
      return {
        changed: true,
        result: {
          success: true,
          app_name: appName,
          port,
          ngrok_url: '',
          message: `Port ${port} registered for '${appName}'`
        }
      };
    });

    if (result.success) {
      return {
        ...result,
        activity_log: await this.activityLogger.logRegister(
          appName,
          result.port
        )
      };
    }

    return result;
  }

  /**
   * Update ngrok URL for a registered port
   */
  async updateNgrokUrl(
    appName: string,
    ngrokUrl: string
  ): Promise<LogWriteResult | null> {
    const port = await this.mutate((data) => {
      const registration = Object.values(data.ports).find(
        (reg) => reg.app_name === appName && reg.status === 'active'
      );
      if (!registration) {
        return { changed: false, result: null };
      }

      registration.ngrok_url = ngrokUrl;
      return { changed: true, result: registration.port };
    });

    if (port !== null) {
      return await this.activityLogger.logTunnelCreated(
        appName,
        port,
        ngrokUrl
      );
    }
    return null;
  }

  async setMonitor(appName: string, monitor: boolean): Promise<boolean> {
    return await this.mutate((data) => {
      const registration = Object.values(data.ports).find(
        (reg) => reg.app_name === appName && reg.status === 'active'
      );
      if (!registration) {
        return { changed: false, result: false };
      }

      registration.monitor = monitor;
      return { changed: true, result: true };
    });
  }

  /**
   * Release a port registration
   */
  async releasePort(appName: string): Promise<PortReleaseResult> {
    const result = await this.mutate((data) => {
      const registration = Object.values(data.ports).find(
        (reg) => reg.app_name === appName && reg.status === 'active'
      );

      if (!registration) {
        return {
          changed: false,
          result: {
            success: false,
            app_name: appName,
            port: 0,
            message: `No active registration found for '${appName}'`
          }
        };
      }

      const port = registration.port;
      registration.status = 'released';
      registration.ngrok_url = null;
      return {
        changed: true,
        result: {
          success: true,
          app_name: appName,
          port,
          message: `Released port ${port} from '${appName}'`
        }
      };
    });

    if (result.success) {
      return {
        ...result,
        activity_log: await this.activityLogger.logRelease(
          appName,
          result.port
        )
      };
    }

    return result;
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
    return this.getAvailablePortIn(this.data, rangeStart, rangeEnd);
  }

  private getAvailablePortIn(
    data: RegistryData,
    rangeStart?: number,
    rangeEnd?: number
  ): number | null {
    const start = rangeStart || this.config.port_range.start;
    const end = rangeEnd || this.config.port_range.end;

    for (let port = start; port <= end; port++) {
      if (this.isPortAvailableIn(data, port)) {
        return port;
      }
    }

    return null;
  }

  /**
   * Check if a port is available
   */
  isPortAvailable(port: number): boolean {
    return this.isPortAvailableIn(this.data, port);
  }

  private isPortAvailableIn(data: RegistryData, port: number): boolean {
    const registration = data.ports[port];
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
    // Acquire shared lock for reading
    const release = await lockfile.lock(this.registryPath, {
      retries: { retries: 5, minTimeout: 100 }
    });

    try {
      this.data = await this.readUnlocked();
    } finally {
      await release();
    }
  }

  private async readUnlocked(): Promise<RegistryData> {
    const content = await readFile(this.registryPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse registry '${this.registryPath}'`, {
        cause: error
      });
    }

    if (!isRegistryData(parsed)) {
      throw new Error(
        `Registry '${this.registryPath}' does not match the expected schema`
      );
    }
    return parsed;
  }

  private async mutate<T>(
    mutation: (data: RegistryData) => MutationResult<T>
  ): Promise<T> {
    await this.ensureRegistryFile();
    const release = await lockfile.lock(this.registryPath, {
      retries: { retries: 5, minTimeout: 100 }
    });

    try {
      const data = await this.readUnlocked();
      const outcome = mutation(data);
      if (outcome.changed) {
        data.last_updated = new Date().toISOString();
        await this.writeUnlocked(data);
      }
      this.data = data;
      return outcome.result;
    } finally {
      await release();
    }
  }

  /**
   * Save registry to disk with atomic write and exclusive lock
   */
  private async save(): Promise<void> {
    await this.ensureRegistryFile();

    // Acquire exclusive lock for writing
    const release = await lockfile.lock(this.registryPath, {
      retries: { retries: 5, minTimeout: 100 }
    });

    try {
      const data = await this.readUnlocked();
      await this.writeUnlocked(data);
      this.data = data;
    } finally {
      await release();
    }
  }

  private async ensureRegistryFile(): Promise<void> {
    await this.ensureDirectory();
    if (existsSync(this.registryPath)) {
      return;
    }

    try {
      await writeFile(this.registryPath, JSON.stringify(this.data, null, 2), {
        encoding: 'utf8',
        flag: 'wx'
      });
    } catch (error) {
      if (!isErrnoException(error, 'EEXIST')) {
        throw error;
      }
    }
  }

  private async writeUnlocked(data: RegistryData): Promise<void> {
    await writeFile(this.registryPath, JSON.stringify(data, null, 2), 'utf8');
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

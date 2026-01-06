/**
 * Configuration loader - loads from default config and user overrides
 * Zero Mock Policy: Real file I/O for config loading
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Config } from './types/index.js';
import { validateBasicAuth, validateCIDRList } from './validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load configuration from default and user config files
 * User config (~/.yardmaster/config.json) overrides defaults
 * Environment variables override file configs
 */
export async function loadConfig(): Promise<Config> {
  // Load default config
  const defaultConfigPath = join(__dirname, '../config/default.json');
  const defaultConfig: Config = JSON.parse(
    await readFile(defaultConfigPath, 'utf-8')
  );

  // Try to load user config
  const userConfigPath = join(homedir(), '.yardmaster', 'config.json');
  let userConfig: Partial<Config> = {};

  if (existsSync(userConfigPath)) {
    try {
      const userConfigContent = await readFile(userConfigPath, 'utf-8');
      userConfig = JSON.parse(userConfigContent);
    } catch (error) {
      console.warn('Failed to load user config, using defaults:', error);
    }
  }

  // Merge configs (user overrides default)
  const config: Config = {
    ...defaultConfig,
    ...userConfig,
    port_range: {
      ...defaultConfig.port_range,
      ...userConfig.port_range
    },
    ngrok: {
      ...defaultConfig.ngrok,
      ...userConfig.ngrok
    },
    registry: {
      ...defaultConfig.registry,
      ...userConfig.registry
    },
    server: {
      ...defaultConfig.server,
      ...userConfig.server
    }
  };

  // Environment variable overrides with validation
  if (process.env.NGROK_AUTH_TOKEN) {
    config.ngrok.auth_token = process.env.NGROK_AUTH_TOKEN;
  }

  if (process.env.NGROK_DOMAIN) {
    config.ngrok.domain = process.env.NGROK_DOMAIN;
  }

  if (process.env.NGROK_BASIC_AUTH) {
    const validation = validateBasicAuth(process.env.NGROK_BASIC_AUTH);
    if (!validation.valid) {
      throw new Error(`Invalid NGROK_BASIC_AUTH: ${validation.error}`);
    }
    config.ngrok.basic_auth = process.env.NGROK_BASIC_AUTH;
  }

  if (process.env.NGROK_IP_ALLOW) {
    const validation = validateCIDRList(process.env.NGROK_IP_ALLOW);
    if (!validation.valid) {
      throw new Error(`Invalid NGROK_IP_ALLOW: ${validation.errors.join(', ')}`);
    }
    if (validation.errors.length > 0) {
      console.warn(`Warning: Some CIDRs in NGROK_IP_ALLOW were invalid and skipped: ${validation.errors.join(', ')}`);
    }
    config.ngrok.ip_allow = validation.cidrs;
  }

  if (process.env.NGROK_IP_DENY) {
    const validation = validateCIDRList(process.env.NGROK_IP_DENY);
    if (!validation.valid) {
      throw new Error(`Invalid NGROK_IP_DENY: ${validation.errors.join(', ')}`);
    }
    if (validation.errors.length > 0) {
      console.warn(`Warning: Some CIDRs in NGROK_IP_DENY were invalid and skipped: ${validation.errors.join(', ')}`);
    }
    config.ngrok.ip_deny = validation.cidrs;
  }

  if (process.env.PORT_RANGE_START) {
    config.port_range.start = parseInt(process.env.PORT_RANGE_START, 10);
  }

  if (process.env.PORT_RANGE_END) {
    config.port_range.end = parseInt(process.env.PORT_RANGE_END, 10);
  }

  // Validate config
  validateConfig(config);

  return config;
}

/**
 * Validate configuration values
 */
function validateConfig(config: Config): void {
  // Validate port range
  if (
    config.port_range.start < 1024 ||
    config.port_range.start > 65535 ||
    config.port_range.end < 1024 ||
    config.port_range.end > 65535
  ) {
    throw new Error(
      'Invalid port range: must be between 1024 and 65535'
    );
  }

  if (config.port_range.start > config.port_range.end) {
    throw new Error('Invalid port range: start must be less than end');
  }

  // Validate ngrok auth token
  if (!config.ngrok.auth_token) {
    throw new Error(
      'ngrok auth token is required. Set in config or NGROK_AUTH_TOKEN env var'
    );
  }

  // Validate registry path
  if (!config.registry.path) {
    throw new Error('Registry path is required in config');
  }
}

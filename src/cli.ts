#!/usr/bin/env node

/**
 * Yardmaster CLI - Command-line interface for port registry management
 * Zero Mock Policy: Uses real PortRegistry and NgrokManager
 */

import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { PortRegistry } from './registry.js';
import { NgrokManager } from './ngrok-manager.js';
import { validateBasicAuth, validateCIDRList } from './validation.js';
import type { LogWriteResult } from './logger.js';
import type { Config } from './types/index.js';

const program = new Command();
const DISPLAY_SAFE_CONFIG_FIELDS = new Set([
  'port_range.start',
  'port_range.end',
  'ngrok.region',
  'ngrok.domain',
  'ngrok.ip_allow',
  'ngrok.ip_deny',
  'registry.path',
  'server.name',
  'server.version',
  'server.description'
]);
const EDITABLE_CONFIG_KEYS = [
  'ngrok.domain',
  'ngrok.basic_auth',
  'ngrok.ip_allow',
  'ngrok.ip_deny'
] as const;

type EditableConfigKey = typeof EDITABLE_CONFIG_KEYS[number];
type JsonObject = Record<string, unknown>;

function isEditableConfigKey(key: string): key is EditableConfigKey {
  return (EDITABLE_CONFIG_KEYS as readonly string[]).includes(key);
}

function requireEditableConfigKey(key: string): EditableConfigKey {
  if (!isEditableConfigKey(key)) {
    throw new Error(
      `Unsupported config key "${key}". Allowed keys: ${EDITABLE_CONFIG_KEYS.join(', ')}`
    );
  }
  return key;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateConfigValue(
  key: EditableConfigKey,
  value: string
): string | string[] {
  switch (key) {
    case 'ngrok.domain':
      return value;
    case 'ngrok.basic_auth': {
      const validation = validateBasicAuth(value);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      return value;
    }
    case 'ngrok.ip_allow':
    case 'ngrok.ip_deny': {
      const validation = validateCIDRList(value);
      if (!validation.valid || validation.errors.length > 0) {
        throw new Error(validation.errors.join(', '));
      }
      return validation.cidrs;
    }
  }
}

async function readUserConfig(path: string): Promise<JsonObject> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(content);
  if (!isJsonObject(parsed)) {
    throw new Error('User config must contain a JSON object');
  }
  return parsed;
}

function updateNgrokSetting(
  config: JsonObject,
  key: EditableConfigKey,
  value: string | string[] | undefined
): JsonObject {
  const updatedConfig = { ...config };
  const existingNgrok = updatedConfig.ngrok;
  if (existingNgrok !== undefined && !isJsonObject(existingNgrok)) {
    throw new Error('User config field "ngrok" must contain a JSON object');
  }

  const ngrok = existingNgrok === undefined ? {} : { ...existingNgrok };
  const property = key.slice('ngrok.'.length);
  if (value === undefined) {
    delete ngrok[property];
  } else {
    ngrok[property] = value;
  }
  updatedConfig.ngrok = ngrok;
  return updatedConfig;
}

async function secureExistingConfig(path: string): Promise<void> {
  try {
    const metadata = await stat(path);
    if ((metadata.mode & 0o177) !== 0) {
      await chmod(path, 0o600);
      console.error(`Warning: tightened ${path} permissions to 0600`);
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
}

async function writeUserConfig(config: JsonObject): Promise<void> {
  const directory = join(homedir(), '.yardmaster');
  const path = join(directory, 'config.json');
  const temporaryPath = join(
    directory,
    `.config.json.${process.pid}.${randomUUID()}.tmp`
  );

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await secureExistingConfig(path);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function setUserConfig(keyArgument: string, value: string): Promise<void> {
  const key = requireEditableConfigKey(keyArgument);
  const validatedValue = validateConfigValue(key, value);
  const path = join(homedir(), '.yardmaster', 'config.json');
  const config = await readUserConfig(path);
  await writeUserConfig(updateNgrokSetting(config, key, validatedValue));
}

async function unsetUserConfig(keyArgument: string): Promise<void> {
  const key = requireEditableConfigKey(keyArgument);
  const path = join(homedir(), '.yardmaster', 'config.json');
  const config = await readUserConfig(path);
  await writeUserConfig(updateNgrokSetting(config, key, undefined));
}

function reportDegradedActivityLog(
  ...results: Array<LogWriteResult | null | undefined>
): void {
  for (const result of results) {
    if (result?.status === 'degraded') {
      console.error(`⚠️  ${result.error}`);
    }
  }
}

/**
 * Retain only explicit display-safe configuration fields. Unknown fields are
 * treated as secrets so future configuration additions fail closed.
 */
function redactSecrets(value: unknown, path: string[] = []): unknown {
  const fieldPath = path.join('.');

  if (DISPLAY_SAFE_CONFIG_FIELDS.has(fieldPath)) {
    return value;
  }

  const containsDisplaySafeField = [...DISPLAY_SAFE_CONFIG_FIELDS].some(
    (safeField) => safeField.startsWith(`${fieldPath}.`)
  );
  if (fieldPath && !containsDisplaySafeField) {
    return value ? '(set)' : '(not set)';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, path));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        redactSecrets(nestedValue, [...path, key])
      ])
    );
  }

  return value ? '(set)' : '(not set)';
}

function redactConfig(config: Config): Config {
  return redactSecrets(config) as Config;
}

program
  .name('yardmaster')
  .description('Port registry with ngrok integration for development')
  .version('1.0.0');

/**
 * List all registered ports
 */
program
  .command('list')
  .description('List all registered ports and their ngrok URLs')
  .option('-a, --all', 'Show all registrations including released')
  .action(async () => {
    try {
      const config = await loadConfig();
      const registry = new PortRegistry(config);
      await registry.initialize();

      const result = registry.queryPorts();

      if (result.total === 0) {
        console.log('No active port registrations');
        return;
      }

      console.log(`\n📋 Active Port Registrations (${result.total})\n`);
      console.log(
        '─'.repeat(80)
      );

      for (const reg of result.registrations) {
        const monitorBadge = reg.monitor === true ? '👁️ ' : reg.monitor === false ? '🚫 ' : '❓ ';
        console.log(`${monitorBadge}🚂 ${reg.app_name}`);
        console.log(`   Port: ${reg.port}`);
        console.log(`   ngrok: ${reg.ngrok_url || '(not tunneled)'}`);
        console.log(`   Registered: ${new Date(reg.registered_at).toLocaleString()}`);
        console.log(`   Status: ${reg.status}`);
        console.log(`   Monitor: ${reg.monitor === true ? 'yes' : reg.monitor === false ? 'no' : 'unset'}`);
        console.log('─'.repeat(80));
      }

      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Register a port
 */
program
  .command('register')
  .description('Register a port for an application')
  .argument('<app-name>', 'Application name')
  .argument('[port]', 'Optional specific port number')
  .option('--tunnel', 'Also expose the port publicly via an ngrok tunnel')
  .option('--monitor', 'Mark this app for monitoring')
  .option('--no-monitor', 'Mark this app to skip monitoring')
  .action(async (appName: string, port: string | undefined, options) => {
    try {
      const config = await loadConfig();
      const registry = new PortRegistry(config);
      await registry.initialize();

      const desiredPort = port ? parseInt(port, 10) : undefined;
      const monitor = options.monitor === true ? true : options.monitor === false ? false : undefined;

      // Register port
      const result = await registry.registerPort(appName, desiredPort, monitor);

      if (!result.success) {
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }

      reportDegradedActivityLog(result.activity_log);
      console.log(`✅ Port ${result.port} registered for '${appName}'`);

      // Tunnels are opt-in: only create one when --tunnel is passed
      if (options.tunnel === true) {
        console.log('🌐 Creating ngrok tunnel...');

        const ngrokManager = new NgrokManager(config);
        const tunnelResult = await ngrokManager.createTunnel(
          result.port,
          appName
        );

        const registryLog = await registry.updateNgrokUrl(
          appName,
          tunnelResult.url
        );
        reportDegradedActivityLog(tunnelResult.activity_log, registryLog);

        console.log(`   ngrok URL: ${tunnelResult.url}`);
        console.log();
        console.log('⚠️  Tunnel will remain active until you run:');
        console.log(`   yardmaster release ${appName}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Release a port
 */
program
  .command('release')
  .description('Release a port and stop its ngrok tunnel')
  .argument('<app-name>', 'Application name')
  .action(async (appName: string) => {
    try {
      const config = await loadConfig();
      const registry = new PortRegistry(config);
      await registry.initialize();

      // Get registration info first
      const registration = registry.getRegistrationByApp(appName);

      if (!registration) {
        console.error(`❌ No active registration found for '${appName}'`);
        process.exit(1);
      }

      // Close ngrok tunnel if exists
      if (registration.ngrok_url) {
        console.log('🌐 Closing ngrok tunnel...');
        const ngrokManager = new NgrokManager(config);
        const tunnelResult = await ngrokManager.closeTunnel(appName);
        reportDegradedActivityLog(tunnelResult.activity_log);
      }

      // Release from registry
      const result = await registry.releasePort(appName);

      if (!result.success) {
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }

      reportDegradedActivityLog(result.activity_log);
      console.log(`✅ Released port ${result.port} from '${appName}'`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Show status and configuration
 */
program
  .command('status')
  .description('Show Yardmaster status and configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      const safeConfig = redactConfig(config);
      const registry = new PortRegistry(config);
      await registry.initialize();

      const result = registry.queryPorts();

      console.log('\n🚂 Yardmaster Status\n');
      console.log('─'.repeat(50));
      console.log(`Port Range: ${safeConfig.port_range.start} - ${safeConfig.port_range.end}`);
      console.log(`Registry Path: ${safeConfig.registry.path}`);
      console.log(`Active Registrations: ${result.total}`);
      console.log(`ngrok Region: ${safeConfig.ngrok.region}`);
      console.log(`ngrok Auth Token: ${safeConfig.ngrok.auth_token}`);
      console.log('─'.repeat(50));
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Show configuration
 */
const configCommand = program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();

      console.log('\n⚙️  Yardmaster Configuration\n');
      console.log(JSON.stringify(redactConfig(config), null, 2));
      console.log();
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

configCommand
  .command('set')
  .description('Set an editable configuration value')
  .argument('<key>', 'Configuration key')
  .argument('<value>', 'Configuration value')
  .action(async (key: string, value: string) => {
    try {
      await setUserConfig(key, value);
      console.log(`${key}: set`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

configCommand
  .command('unset')
  .description('Unset an editable configuration value')
  .argument('<key>', 'Configuration key')
  .action(async (key: string) => {
    try {
      await unsetUserConfig(key);
      console.log(`${key}: unset`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Set monitor flag on an existing registration
 */
program
  .command('monitor')
  .description('Set whether an app should be monitored')
  .argument('<app-name>', 'Application name')
  .option('--off', 'Disable monitoring for this app')
  .action(async (appName: string, options) => {
    try {
      const config = await loadConfig();
      const registry = new PortRegistry(config);
      await registry.initialize();

      const enable = !options.off;
      const found = await registry.setMonitor(appName, enable);

      if (!found) {
        console.error(`❌ No active registration found for '${appName}'`);
        process.exit(1);
      }

      console.log(`✅ '${appName}' monitoring ${enable ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse command line
program.parse();

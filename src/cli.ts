#!/usr/bin/env node

/**
 * Yardmaster CLI - Command-line interface for port registry management
 * Zero Mock Policy: Uses real PortRegistry and NgrokManager
 */

import { Command } from 'commander';
import { loadConfig } from './config.js';
import { PortRegistry } from './registry.js';
import { NgrokManager } from './ngrok-manager.js';
import type { LogWriteResult } from './logger.js';
import type {
  Config,
  ConfigFieldVisibilityOf
} from './types/index.js';

const program = new Command();
type LeafPath<Value extends object> = {
  [Key in keyof Value & string]-?: NonNullable<Value[Key]> extends readonly unknown[]
    ? Key
    : NonNullable<Value[Key]> extends string | number | boolean
      ? Key
      : NonNullable<Value[Key]> extends object
        ? `${Key}.${LeafPath<NonNullable<Value[Key]>>}`
        : Key;
}[keyof Value & string];

type ValueAtPath<Value, Path extends string> =
  Path extends `${infer Key}.${infer RemainingPath}`
    ? Key extends keyof Value
      ? ValueAtPath<NonNullable<Value[Key]>, RemainingPath>
      : never
    : Path extends keyof Value
      ? NonNullable<Value[Path]>
      : never;

type DisplayShape<Value> =
  [Value] extends [number]
    ? 'number'
    : [Value] extends [string]
      ? 'string'
      : [Value] extends [readonly string[]]
        ? 'string[]'
        : never;

type ConfigDisplayPolicy = {
  [Path in LeafPath<Config>]: {
    readonly shape: DisplayShape<ValueAtPath<Config, Path>>;
    readonly visibility: ConfigFieldVisibilityOf<
      ValueAtPath<Config, Path>
    >;
  };
};

const CONFIG_DISPLAY_POLICY = {
  'port_range.start': { shape: 'number', visibility: 'display-safe' },
  'port_range.end': { shape: 'number', visibility: 'display-safe' },
  'ngrok.auth_token': { shape: 'string', visibility: 'secret' },
  'ngrok.region': { shape: 'string', visibility: 'display-safe' },
  'ngrok.domain': { shape: 'string', visibility: 'display-safe' },
  'ngrok.basic_auth': { shape: 'string', visibility: 'secret' },
  'ngrok.ip_allow': { shape: 'string[]', visibility: 'display-safe' },
  'ngrok.ip_deny': { shape: 'string[]', visibility: 'display-safe' },
  'registry.path': { shape: 'string', visibility: 'display-safe' },
  'server.name': { shape: 'string', visibility: 'display-safe' },
  'server.version': { shape: 'string', visibility: 'display-safe' },
  'server.description': { shape: 'string', visibility: 'display-safe' }
} as const satisfies ConfigDisplayPolicy;

const DISPLAY_SAFE_CONFIG_FIELDS = new Map(
  Object.entries(CONFIG_DISPLAY_POLICY).flatMap(([path, policy]) =>
    policy.visibility === 'display-safe'
      ? [[path, policy.shape] as const]
      : []
  )
);

function hasExpectedDisplayShape(fieldPath: string, value: unknown): boolean {
  const expectedShape = DISPLAY_SAFE_CONFIG_FIELDS.get(fieldPath);
  if (expectedShape === 'string[]') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
  return typeof value === expectedShape;
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

  if (
    DISPLAY_SAFE_CONFIG_FIELDS.has(fieldPath) &&
    hasExpectedDisplayShape(fieldPath, value)
  ) {
    return value;
  }

  const containsDisplaySafeField = [...DISPLAY_SAFE_CONFIG_FIELDS.keys()].some(
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
program
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

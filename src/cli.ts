#!/usr/bin/env node

/**
 * Yardmaster CLI - Command-line interface for port registry management
 * Zero Mock Policy: Uses real PortRegistry and NgrokManager
 */

import { Command } from 'commander';
import { loadConfig } from './config.js';
import { PortRegistry } from './registry.js';
import { NgrokManager } from './ngrok-manager.js';

const program = new Command();

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

      console.log(`✅ Port ${result.port} registered for '${appName}'`);

      // Tunnels are opt-in: only create one when --tunnel is passed
      if (options.tunnel === true) {
        console.log('🌐 Creating ngrok tunnel...');

        const ngrokManager = new NgrokManager(config);
        const ngrokUrl = await ngrokManager.createTunnel(result.port, appName);

        await registry.updateNgrokUrl(appName, ngrokUrl);

        console.log(`   ngrok URL: ${ngrokUrl}`);
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
        await ngrokManager.closeTunnel(appName);
      }

      // Release from registry
      const result = await registry.releasePort(appName);

      if (!result.success) {
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }

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
      const registry = new PortRegistry(config);
      await registry.initialize();

      const result = registry.queryPorts();

      console.log('\n🚂 Yardmaster Status\n');
      console.log('─'.repeat(50));
      console.log(`Port Range: ${config.port_range.start} - ${config.port_range.end}`);
      console.log(`Registry Path: ${config.registry.path}`);
      console.log(`Active Registrations: ${result.total}`);
      console.log(`ngrok Region: ${config.ngrok.region}`);
      console.log(`ngrok Auth Token: ${config.ngrok.auth_token ? `${config.ngrok.auth_token.substring(0, 8)}...` : '(not set)'}`);
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
      console.log(JSON.stringify(config, null, 2));
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

#!/usr/bin/env node

/**
 * Yardmaster MCP Server
 * Port registry with ngrok integration for AI agents
 * Zero Mock Policy: Real ngrok tunnels and file I/O
 */

import { pathToFileURL } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { PortRegistry } from './registry.js';
import { NgrokManager } from './ngrok-manager.js';
import {
  logger as defaultLogger,
  type Logger,
  type LogWriteResult
} from './logger.js';
import type { Config } from './types/index.js';

const MAX_NOTES_LENGTH = 2000;

function validateNotes(notes: unknown): string | null | undefined {
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    throw new TypeError('notes must be a string or null');
  }
  if (typeof notes === 'string' && notes.length > MAX_NOTES_LENGTH) {
    throw new TypeError(
      `notes must not exceed ${MAX_NOTES_LENGTH} characters`
    );
  }
  return notes;
}

/**
 * Main MCP Server
 */
export class YardmasterServer {
  private server: Server;
  private registry?: PortRegistry;
  private ngrokManager?: NgrokManager;
  private activityLogger: Logger;

  constructor(activityLogger: Logger = defaultLogger) {
    this.activityLogger = activityLogger;
    this.server = new Server(
      {
        name: 'yardmaster',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Ensure server is initialized before handling requests
   */
  private ensureInitialized(): void {
    if (!this.registry || !this.ngrokManager) {
      throw new Error(
        'Yardmaster server not initialized. Call start() before handling requests.'
      );
    }
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'register_port',
          description:
            'Yardmaster port registry: register a port for an application. Use when asked to register, claim, or reserve a port for a dev server or app. If port is not specified, one will be auto-assigned from the configured range. Does NOT create a public tunnel unless tunnel=true is passed.',
          inputSchema: {
            type: 'object',
            properties: {
              app_name: {
                type: 'string',
                description: 'Name of the application (e.g., "frontend", "api")'
              },
              desired_port: {
                type: 'number',
                description:
                  'Optional specific port number. If not provided, will auto-assign from range.'
              },
              tunnel: {
                type: 'boolean',
                description:
                  'Set true to also expose the port publicly via an ngrok tunnel (requires ngrok auth token). Default false: registry entry only, no tunnel. Only enable when the user explicitly asks for a public/ngrok URL.'
              },
              notes: {
                type: ['string', 'null'],
                description:
                  'Optional hostname or exposure details. Pass null to leave the registration explicitly unannotated.'
              }
            },
            required: ['app_name']
          }
        },
        {
          name: 'annotate_port',
          description:
            'Yardmaster port registry: update hostname or exposure notes on an existing active registration without releasing its port. Pass null to clear the notes.',
          inputSchema: {
            type: 'object',
            properties: {
              app_name: {
                type: 'string',
                description: 'Name of the application to annotate'
              },
              notes: {
                type: ['string', 'null'],
                description:
                  'Hostname or exposure details for the application, or null to clear them'
              }
            },
            required: ['app_name', 'notes']
          }
        },
        {
          name: 'release_port',
          description:
            'Yardmaster port registry: release a registered port and stop its ngrok tunnel if one exists. Use when asked to release, free, or unregister a port. Frees the port for other applications.',
          inputSchema: {
            type: 'object',
            properties: {
              app_name: {
                type: 'string',
                description: 'Name of the application to release'
              }
            },
            required: ['app_name']
          }
        },
        {
          name: 'query_ports',
          description:
            'Yardmaster port registry: list all registered ports with their applications, ngrok URLs, and notes. Notes carry hostname/exposure detail, so read them when determining how an app is reachable. Use when asked what ports are in use, what is running where, or to look up the port registry. Optionally filter by app name or port number.',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                description:
                  'Optional filter string to match against app names or port numbers'
              }
            }
          }
        },
        {
          name: 'get_available_port',
          description:
            'Yardmaster port registry: get the next available/free port in the configured range. Use when asked to find an open port for a new dev server. Useful for checking port availability before registration.',
          inputSchema: {
            type: 'object',
            properties: {
              range_start: {
                type: 'number',
                description: 'Optional custom range start (overrides config)'
              },
              range_end: {
                type: 'number',
                description: 'Optional custom range end (overrides config)'
              }
            }
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'register_port':
            return await this.handleRegisterPort(args as any);

          case 'annotate_port':
            return await this.handleAnnotatePort(args as any);

          case 'release_port':
            return await this.handleReleasePort(args as any);

          case 'query_ports':
            return await this.handleQueryPorts(args as any);

          case 'get_available_port':
            return await this.handleGetAvailablePort(args as any);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * Handle register_port tool call
   */
  private async handleRegisterPort(args: {
    app_name: string;
    desired_port?: number;
    tunnel?: boolean;
    notes?: unknown;
  }) {
    const notes = validateNotes(args.notes);
    this.ensureInitialized();

    const result = await this.registry!.registerPort(
      args.app_name,
      args.desired_port,
      undefined,
      notes
    );

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Failed: ${result.message}` }],
        isError: true
      };
    }

    // Tunnels are opt-in: only create one when explicitly requested
    if (args.tunnel !== true) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                app_name: args.app_name,
                port: result.port,
                ngrok_url: null,
                message: `Port ${result.port} registered for '${args.app_name}' (no tunnel; pass tunnel=true to expose publicly)`,
                activity_log: result.activity_log
              },
              null,
              2
            )
          }
        ]
      };
    }

    try {
      const tunnelResult = await this.ngrokManager!.createTunnel(
        result.port,
        args.app_name
      );

      // Update registry with ngrok URL
      const registryLog = await this.registry!.updateNgrokUrl(
        args.app_name,
        tunnelResult.url
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                app_name: args.app_name,
                port: result.port,
                ngrok_url: tunnelResult.url,
                message: `Port ${result.port} registered for '${args.app_name}' with ngrok tunnel`,
                activity_log: {
                  registration: result.activity_log,
                  tunnel: tunnelResult.activity_log,
                  registry_update: registryLog
                }
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      // Rollback registration if ngrok fails
      await this.registry!.releasePort(args.app_name);
      throw error;
    }
  }

  /**
   * Handle annotate_port tool call
   */
  private async handleAnnotatePort(args: {
    app_name: string;
    notes?: unknown;
  }) {
    const notes = validateNotes(args.notes);
    if (notes === undefined) {
      throw new TypeError('notes must be a string or null');
    }
    this.ensureInitialized();
    await this.registry!.setNotes(args.app_name, notes);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              app_name: args.app_name,
              notes,
              message: `Updated notes for '${args.app_name}'`
            },
            null,
            2
          )
        }
      ]
    };
  }

  /**
   * Handle release_port tool call
   */
  private async handleReleasePort(args: { app_name: string }) {
    this.ensureInitialized();
    let tunnelActivityLog: LogWriteResult | null = null;

    // Close ngrok tunnel first
    try {
      const tunnelResult = await this.ngrokManager!.closeTunnel(args.app_name);
      tunnelActivityLog = tunnelResult.activity_log;
    } catch (error) {
      console.warn(`Warning: Failed to close ngrok tunnel: ${error}`);
    }

    // Release from registry
    const result = await this.registry!.releasePort(args.app_name);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Failed: ${result.message}` }],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { ...result, tunnel_activity_log: tunnelActivityLog },
            null,
            2
          )
        }
      ]
    };
  }

  /**
   * Handle query_ports tool call
   */
  private async handleQueryPorts(args: { filter?: string }) {
    this.ensureInitialized();

    const result = this.registry!.queryPorts(args.filter);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total: result.total,
              registrations: result.registrations.map((reg) => ({
                app_name: reg.app_name,
                port: reg.port,
                ngrok_url: reg.ngrok_url,
                registered_at: reg.registered_at,
                status: reg.status,
                notes: reg.notes
              }))
            },
            null,
            2
          )
        }
      ]
    };
  }

  /**
   * Handle get_available_port tool call
   */
  private async handleGetAvailablePort(args: {
    range_start?: number;
    range_end?: number;
  }) {
    this.ensureInitialized();

    const port = this.registry!.getAvailablePort(
      args.range_start,
      args.range_end
    );

    if (!port) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                message: 'No available ports in range'
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              port,
              message: `Port ${port} is available`
            },
            null,
            2
          )
        }
      ]
    };
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * Initialize registry and tunnel management for request handling
   */
  async initialize(config: Config): Promise<void> {
    this.registry = new PortRegistry(config, this.activityLogger);
    await this.registry.initialize();

    this.ngrokManager = new NgrokManager(config, undefined, this.activityLogger);
  }

  /**
   * Connect the MCP server to a transport
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      await this.initialize(await loadConfig());
      await this.connect(new StdioServerTransport());

      console.error('Yardmaster MCP server started');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.error('Shutting down Yardmaster...');

    try {
      // Close all ngrok tunnels
      if (this.ngrokManager) {
        await this.ngrokManager.shutdown();
      }
      console.error('All ngrok tunnels closed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = new YardmasterServer();
  server.start().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

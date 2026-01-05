#!/usr/bin/env node

/**
 * Yardmaster MCP Server
 * Port registry with ngrok integration for AI agents
 * Zero Mock Policy: Real ngrok tunnels and file I/O
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { PortRegistry } from './registry.js';
import { NgrokManager } from './ngrok-manager.js';

/**
 * Main MCP Server
 */
class YardmasterServer {
  private server: Server;
  private registry?: PortRegistry;
  private ngrokManager?: NgrokManager;

  constructor() {
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
            'Register a port for an application and create an ngrok tunnel. If port is not specified, one will be auto-assigned from the configured range.',
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
              }
            },
            required: ['app_name']
          }
        },
        {
          name: 'release_port',
          description:
            'Release a registered port and stop its ngrok tunnel. Frees the port for other applications.',
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
            'List all registered ports with their applications and ngrok URLs. Optionally filter by app name or port number.',
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
            'Get the next available port in the configured range. Useful for checking port availability before registration.',
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
  }) {
    this.ensureInitialized();

    const result = await this.registry!.registerPort(
      args.app_name,
      args.desired_port
    );

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Failed: ${result.message}` }],
        isError: true
      };
    }

    // Create ngrok tunnel
    try {
      const ngrokUrl = await this.ngrokManager!.createTunnel(
        result.port,
        args.app_name
      );

      // Update registry with ngrok URL
      await this.registry!.updateNgrokUrl(args.app_name, ngrokUrl);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                app_name: args.app_name,
                port: result.port,
                ngrok_url: ngrokUrl,
                message: `Port ${result.port} registered for '${args.app_name}' with ngrok tunnel`
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
   * Handle release_port tool call
   */
  private async handleReleasePort(args: { app_name: string }) {
    this.ensureInitialized();

    // Close ngrok tunnel first
    try {
      await this.ngrokManager!.closeTunnel(args.app_name);
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
          text: JSON.stringify(result, null, 2)
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
                status: reg.status
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
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Load configuration
      const config = await loadConfig();

      // Initialize registry
      this.registry = new PortRegistry(config);
      await this.registry.initialize();

      // Initialize ngrok manager
      this.ngrokManager = new NgrokManager(config);

      // Start MCP server with stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

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

// Start the server
const server = new YardmasterServer();
server.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

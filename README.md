# Yardmaster

**Port registry with ngrok integration and MCP server for AI agents**

Yardmaster helps AI agents (like Claude) automatically manage port allocations and create ngrok tunnels for development. No more port conflicts, no more manual ngrok setup!

## Features

- **Port Registry**: Automatic port allocation from configurable range (default: 3000-9000)
- **ngrok Integration**: Automatic tunnel creation with public URLs
- **MCP Server**: AI agents can register/release ports via Model Context Protocol
- **CLI**: Manual management via command-line interface
- **TUI**: Beautiful terminal interface built with bubbletea (see [tui/README.md](tui/README.md))
- **Persistent Storage**: JSON-based storage survives restarts
- **Zero Mock Policy**: Real ngrok tunnels and file I/O from day one

## Prerequisites

- **Node.js 18+** (or Bun runtime)
- **ngrok account** - Free tier works ([sign up here](https://dashboard.ngrok.com/signup))
- **Go 1.21+** (optional, for TUI only)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/croakingtoad/yardmaster.git
cd yardmaster
npm install
npm run build
```

### 2. Get Your ngrok Auth Token

1. Sign up at [ngrok.com](https://dashboard.ngrok.com/signup) if you haven't already
2. Go to [your authtoken page](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Copy your auth token

### 3. Configure Auth Token

**Option A: Environment Variable (Recommended)**

```bash
export NGROK_AUTH_TOKEN="your_token_here"
```

Make it permanent by adding to your shell profile:

```bash
# For bash
echo 'export NGROK_AUTH_TOKEN="your_token_here"' >> ~/.bashrc
source ~/.bashrc

# For zsh
echo 'export NGROK_AUTH_TOKEN="your_token_here"' >> ~/.zshrc
source ~/.zshrc
```

**Option B: User Config File**

Create `~/.yardmaster/config.json`:

```json
{
  "ngrok": {
    "auth_token": "your_token_here"
  }
}
```

**NEVER commit your ngrok auth token to git!** Always use environment variables or user config files (which are outside the repo).

### 4. Verify Setup

```bash
# Test the CLI
yardmaster status

# Expected output:
# Yardmaster Status
# ──────────────────────────────────────────────────
# Port Range: 3000 - 9000
# Registry Path: ~/.yardmaster/registry.json
# Active Registrations: 0
# ngrok Region: us
# ngrok Auth Token: xxxxxxxx...
# ──────────────────────────────────────────────────
```

### 5. Make CLI Globally Available (Optional)

```bash
npm link
# Now you can use: yardmaster <command>
```

## Quick Start

> **IMPORTANT**: See [CLAUDE_USAGE_GUIDE.md](CLAUDE_USAGE_GUIDE.md) for how to ensure Claude actually uses Yardmaster!

### For AI Agents (MCP)

Add to your MCP server config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yardmaster": {
      "command": "node",
      "args": ["/absolute/path/to/yardmaster/dist/index.js"],
      "env": {
        "NGROK_AUTH_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Note**: Use absolute paths, not relative. The `env` section is optional if you've set `NGROK_AUTH_TOKEN` globally.

Then AI agents can use:

```javascript
// Register a port (auto-assign)
await mcp.callTool('register_port', { app_name: 'frontend' });
// Returns: { port: 3000, ngrok_url: "https://abc123.ngrok.app" }

// Register specific port
await mcp.callTool('register_port', { app_name: 'api', desired_port: 8080 });

// List all ports
await mcp.callTool('query_ports');

// Release port
await mcp.callTool('release_port', { app_name: 'frontend' });

// Get next available port
await mcp.callTool('get_available_port');
```

### For Manual Use (CLI)

```bash
# Register a port (auto-assigns)
yardmaster register myapp

# Register specific port
yardmaster register myapp 3000

# List all registered ports
yardmaster list

# Release a port
yardmaster release myapp

# Show status
yardmaster status

# Show configuration
yardmaster config
```

### For Interactive Use (TUI)

Launch the beautiful terminal UI for visual port management:

```bash
cd tui
go build -o yardmaster-tui
./yardmaster-tui
```

**TUI Features:**
- Real-time port list with event-driven updates
- Detailed port information view
- Vim-style keyboard navigation
- Styled with lipgloss
- Pagination for large port lists (20 per page)
- Thread-safe file locking

See [tui/README.md](tui/README.md) for full TUI documentation.

## Configuration

### Default Configuration

Located in `config/default.json`:

```json
{
  "port_range": {
    "start": 3000,
    "end": 9000
  },
  "ngrok": {
    "auth_token": "your-token-here",
    "region": "us"
  },
  "registry": {
    "path": "~/.yardmaster/registry.json"
  }
}
```

### User Configuration

Override defaults by creating `~/.yardmaster/config.json`:

```json
{
  "port_range": {
    "start": 4000,
    "end": 5000
  },
  "ngrok": {
    "auth_token": "your_token_here",
    "region": "us"
  }
}
```

**Available ngrok regions**: `us`, `eu`, `ap`, `au`, `sa`, `jp`, `in`

### Environment Variables

```bash
# Required
export NGROK_AUTH_TOKEN="your-token"

# Optional - Custom ngrok domain (requires paid ngrok account)
export NGROK_DOMAIN="locomotive.ngrok.dev"

# Optional - Basic authentication (protects tunnel with HTTP Basic Auth)
export NGROK_BASIC_AUTH="username:password"

# Optional - IP restrictions (comma-separated CIDR ranges)
export NGROK_IP_ALLOW="1.2.3.4/32,10.0.0.0/8"    # Allow only these IPs
export NGROK_IP_DENY="192.168.1.0/24"            # Deny these IPs

# Optional - Custom port range
export PORT_RANGE_START=4000
export PORT_RANGE_END=5000
```

**Security Notes**:
- Custom ngrok domains (`NGROK_DOMAIN`) require a paid ngrok account with reserved domains or subdomains. Leave unset to use ngrok's free random URLs.
- **Always use authentication** (`NGROK_BASIC_AUTH`) or IP restrictions (`NGROK_IP_ALLOW`/`NGROK_IP_DENY`) for production tunnels to prevent unauthorized access.
- Basic auth format: `username:password` (colon-separated)
- IP restrictions use CIDR notation (e.g., `1.2.3.4/32` for single IP, `10.0.0.0/8` for range)

## Architecture

```
┌─────────────────────────┐
│  AI Agent (Claude)      │
└───────────┬─────────────┘
            │ MCP Protocol
┌───────────▼─────────────┐
│  Yardmaster MCP Server  │
│  - register_port        │
│  - release_port         │
│  - query_ports          │
│  - get_available_port   │
└───────────┬─────────────┘
            │
   ┌────────┴────────┐
   │                 │
┌──▼──────┐   ┌──────▼──────┐
│Registry │   │NgrokManager │
│(JSON)   │   │(SDK)        │
└─────────┘   └──────┬──────┘
                     │
              ┌──────▼──────┐
              │ ngrok Cloud │
              │ Public URLs │
              └─────────────┘
```

### Components

- **PortRegistry**: Manages port allocations with persistent JSON storage
- **NgrokManager**: Wraps @ngrok/ngrok SDK for tunnel lifecycle
- **MCP Server**: Exposes 4 tools for AI agents
- **CLI**: Command-line interface for manual management

## How It Works

1. **AI agent needs a port**: Calls `register_port` with app name
2. **Yardmaster**:
   - Checks registry for conflicts
   - Auto-assigns port from configured range (or uses specified port)
   - Creates ngrok tunnel for that port
   - Stores mapping in `~/.yardmaster/registry.json`
   - Returns port number and public ngrok URL
3. **Agent uses port**: App runs on that port, accessible via ngrok URL
4. **Agent done**: Calls `release_port` to cleanup
5. **Yardmaster**: Closes tunnel, releases port, updates registry

## Examples

### Claude AI Workflow

```
User: "Create a React app on a free port"

Claude: [Internally]
  1. Calls: register_port("my-react-app")
  2. Gets: { port: 3000, ngrok_url: "https://xyz.ngrok.app" }
  3. Runs: npm create vite@latest my-react-app
  4. Configures vite to use port 3000
  5. Starts dev server
  6. Tells user: "App running at https://xyz.ngrok.app"

User: "I'm done"

Claude: [Internally]
  1. Calls: release_port("my-react-app")
  2. Confirms cleanup to user
```

### CLI Workflow

```bash
# Start working on frontend
$ yardmaster register frontend
✓ Port 3000 registered for 'frontend'
Creating ngrok tunnel...
   ngrok URL: https://abc123.ngrok.app

# See what's running
$ yardmaster list
Active Port Registrations (2)
────────────────────────────────────────────────────────────────────────────────
frontend
   Port: 3000
   ngrok: https://abc123.ngrok.app
   Registered: 12/28/2025, 10:30:00 AM
   Status: active
────────────────────────────────────────────────────────────────────────────────
api
   Port: 8080
   ngrok: https://def456.ngrok.app
   Registered: 12/28/2025, 10:32:00 AM
   Status: active
────────────────────────────────────────────────────────────────────────────────

# Done with frontend
$ yardmaster release frontend
Closing ngrok tunnel...
✓ Released port 3000 from 'frontend'
```

## MCP Tools Reference

### register_port

Register a port for an application and create ngrok tunnel.

**Input**:
- `app_name` (string, required): Application name
- `desired_port` (number, optional): Specific port (auto-assigns if not provided)

**Output**:
```json
{
  "success": true,
  "app_name": "myapp",
  "port": 3000,
  "ngrok_url": "https://abc123.ngrok.app",
  "message": "Port 3000 registered for 'myapp' with ngrok tunnel"
}
```

### release_port

Release a port and stop its ngrok tunnel.

**Input**:
- `app_name` (string, required): Application name

**Output**:
```json
{
  "success": true,
  "app_name": "myapp",
  "port": 3000,
  "message": "Released port 3000 from 'myapp'"
}
```

### query_ports

List all registered ports.

**Input**:
- `filter` (string, optional): Filter by app name or port

**Output**:
```json
{
  "total": 2,
  "registrations": [
    {
      "app_name": "frontend",
      "port": 3000,
      "ngrok_url": "https://abc123.ngrok.app",
      "registered_at": "2025-12-28T10:30:00.000Z",
      "status": "active"
    }
  ]
}
```

### get_available_port

Get next available port in range.

**Input**:
- `range_start` (number, optional): Custom range start
- `range_end` (number, optional): Custom range end

**Output**:
```json
{
  "success": true,
  "port": 3001,
  "message": "Port 3001 is available"
}
```

## Zero Mock Policy Compliance

Yardmaster follows the **Zero Mock Policy**: all code uses real implementations from day one.

- Real ngrok tunnels via @ngrok/ngrok SDK
- Real file I/O for registry persistence
- Real MCP protocol via @modelcontextprotocol/sdk
- No mocks, stubs, or placeholders

## Roadmap

### Future Enhancements

- **Web Dashboard**: Browser-based UI for managing ports across machines
- **Multi-Machine Aggregation**: Auth tokens to aggregate registries
- **Analytics**: Port usage metrics and history
- **Docker Integration**: Auto-discover containerized apps
- **Webhooks**: Notifications on port events
- **Database Backend**: SQLite/Postgres instead of JSON
- **Team Features**: Multi-user/organization support

### Recently Completed

- Custom ngrok domains and subdomains
- Authentication (Basic Auth, IP restrictions)
- Terminal UI (TUI) with bubbletea
- File locking for thread safety
- Event-driven file watching (fsnotify)
- Comprehensive input validation
- Test suite (21 TypeScript + 4 Go tests)

## Troubleshooting

### "Failed to initialize ngrok"

**Cause**: Auth token not set or invalid

**Fix**:
1. Verify token is set: `echo $NGROK_AUTH_TOKEN`
2. Check token is valid at [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Try setting in user config file (`~/.yardmaster/config.json`) instead
4. Ensure no typos in token (they're long!)

### "No available ports in range"

**Cause**: All ports in configured range (default: 3000-9000) are occupied

**Fix**:
1. List current registrations: `yardmaster list`
2. Release unused ports: `yardmaster release <app_name>`
3. Expand port range in config or environment variables
4. Check for other processes: `lsof -i :3000-9000`

### "Port already in use"

**Cause**: Another app has registered that specific port

**Fix**:
1. Check active registrations: `yardmaster list`
2. Release the existing registration: `yardmaster release <app_name>`
3. Choose a different port or use auto-assignment (omit port number)

### MCP Server Not Responding

**Cause**: Incorrect path, missing auth token, or server crash

**Fix**:
1. Verify **absolute** path in MCP config (not relative)
2. Check `NGROK_AUTH_TOKEN` is in `env` section or globally set
3. Test manually: `node /path/to/yardmaster/dist/index.js`
4. Check MCP logs for errors (location varies by client)
5. Restart your AI client (Claude Desktop, etc.)

### Invalid NGROK_BASIC_AUTH Error

**Cause**: Basic auth format is incorrect

**Fix**:
- Format must be `username:password` (colon-separated)
- Example: `NGROK_BASIC_AUTH="admin:secure123"`
- Cannot be empty or missing password

### Invalid NGROK_IP_ALLOW/DENY Error

**Cause**: Invalid CIDR notation

**Fix**:
- Use format: `IP/prefix` (e.g., `192.168.1.0/24`)
- For single IP: `1.2.3.4/32`
- For multiple: `1.2.3.4/32,10.0.0.0/8` (comma-separated)
- IPv6 supported: `2001:db8::/32`

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm test

# Watch tests
npm run test:watch
```

### Testing

The project includes comprehensive tests for critical functionality:

**TypeScript Tests** (`src/validation.test.ts`):
- Basic auth format validation (21 test cases)
- CIDR notation validation
- IPv4 and IPv6 support
- Edge case handling

**Go Tests** (`tui/internal/registry/reader_test.go`):
- Registry file parsing
- Empty registry handling
- Invalid JSON error handling
- Active port filtering

Run tests:
```bash
# TypeScript tests
npm test

# Go tests
cd tui && go test ./...
```

## License

MIT

## Contributing

Issues and PRs welcome! This is an MVP - there's plenty of room for improvement.

---

Built by LOCOMOTIVE

# Yardmaster

Automatic port allocation and ngrok tunnel management for AI agents via MCP protocol.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
  - [CLI Commands](#cli-commands)
  - [MCP Server](#mcp-server)
  - [Terminal UI (TUI)](#terminal-ui-tui)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## Features

- **Automatic Port Allocation**: Assigns ports from configurable range (default: 3000-9000)
- **ngrok Tunnel Creation**: Creates public HTTPS tunnels automatically
- **MCP Protocol Support**: Four tools for AI agent integration
- **CLI Interface**: Manual port management via command line
- **Terminal UI (TUI)**: Interactive interface built with Go and bubbletea
- **Persistent Registry**: JSON-based storage at `~/.yardmaster/registry.json`
- **Security Features**: HTTP Basic Auth and IP restrictions
- **Custom Domains**: Support for paid ngrok reserved domains
- **Thread Safe**: File locking prevents concurrent access corruption

## Prerequisites

- Node.js 18 or later
- ngrok account ([free tier available](https://dashboard.ngrok.com/signup))
- Go 1.21 or later (optional, only for TUI)

## Installation

```bash
git clone https://github.com/croakingtoad/yardmaster.git
cd yardmaster
npm install
npm run build
npm link  # Optional: makes 'yardmaster' command globally available
```

Set your ngrok auth token:

```bash
export NGROK_AUTH_TOKEN="your_token_here"
```

Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken

Verify installation:

```bash
yardmaster status
```

## Quick Start

### Register and use a port:

```bash
yardmaster register myapp
# Output: Port 3000 registered for 'myapp'
#         ngrok URL: https://abc123.ngrok.app

# Your app is now accessible at https://abc123.ngrok.app
```

### Release when done:

```bash
yardmaster release myapp
```

### View all registrations:

```bash
yardmaster list
```

## Configuration

### Environment Variables

```bash
# Required
export NGROK_AUTH_TOKEN="your_token_here"

# Optional - Security
export NGROK_BASIC_AUTH="username:password"
export NGROK_IP_ALLOW="1.2.3.4/32,10.0.0.0/8"
export NGROK_IP_DENY="192.168.1.0/24"

# Optional - Custom domain (requires paid ngrok account)
export NGROK_DOMAIN="your-subdomain.ngrok.dev"

# Optional - Port range
export PORT_RANGE_START=4000
export PORT_RANGE_END=5000
```

### User Config File

Create `~/.yardmaster/config.json`:

```json
{
  "port_range": {
    "start": 3000,
    "end": 9000
  },
  "ngrok": {
    "auth_token": "your_token_here",
    "region": "us"
  }
}
```

Available ngrok regions: `us`, `eu`, `ap`, `au`, `sa`, `jp`, `in`

Environment variables override config file settings.

## Usage

### CLI Commands

```bash
# Register a port (auto-assign from range)
yardmaster register <app_name>

# Register specific port
yardmaster register <app_name> <port>

# List all active ports
yardmaster list

# Release a port
yardmaster release <app_name>

# Show configuration and status
yardmaster status
yardmaster config
```

### MCP Server

For AI agents like Claude, add to your MCP config (e.g., `claude_desktop_config.json`):

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

**Requirements:**
- Use absolute paths, not relative
- Include auth token in `env` or set globally

#### Available MCP Tools

**register_port**
- Input: `app_name` (required), `desired_port` (optional)
- Output: `{ port, ngrok_url, success, message }`
- Creates tunnel and registers port

**release_port**
- Input: `app_name` (required)
- Output: `{ port, success, message }`
- Closes tunnel and releases port

**query_ports**
- Input: `filter` (optional)
- Output: `{ total, registrations[] }`
- Lists active port registrations

**get_available_port**
- Input: `range_start` (optional), `range_end` (optional)
- Output: `{ port, success, message }`
- Returns next available port in range

### Terminal UI (TUI)

Build and run the interactive terminal interface:

```bash
cd tui
go build -ldflags="-s -w" -o yardmaster-tui
./yardmaster-tui
```

**Features:**
- Event-driven updates (no polling)
- Pagination (20 ports per page)
- Security status display
- Vim-style navigation (j/k/h/l)
- Thread-safe file locking

**Keyboard Shortcuts:**
- `↑/↓` or `j/k` - Navigate
- `←/→` or `h/l` - Change page
- `Enter` - View details
- `Esc` - Go back
- `r` - Refresh
- `q` - Quit

See [tui/README.md](tui/README.md) for complete documentation.

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

**Components:**
- **PortRegistry**: Manages port allocations with JSON persistence and file locking
- **NgrokManager**: Wraps @ngrok/ngrok SDK for tunnel lifecycle
- **MCP Server**: Exposes tools for AI agent integration
- **CLI**: Command-line interface for manual operations
- **TUI**: Interactive terminal interface (Go/bubbletea)

## Security

### Authentication

HTTP Basic Auth protects tunnel endpoints:

```bash
export NGROK_BASIC_AUTH="username:password"
yardmaster register secure-app
```

All tunnels created after setting `NGROK_BASIC_AUTH` require username/password authentication.

### IP Restrictions

Limit tunnel access by IP address using CIDR notation:

```bash
# Allow only specific IPs
export NGROK_IP_ALLOW="1.2.3.4/32,10.0.0.0/8"

# Deny specific IP ranges
export NGROK_IP_DENY="192.168.1.0/24"

yardmaster register restricted-app
```

**Note:** IP restrictions require a paid ngrok account. Free accounts receive error `ERR_NGROK_9017`.

### Security Metadata

Security settings are stored in registry for each port:

```json
{
  "security": {
    "basic_auth": true,
    "ip_restrictions": false,
    "custom_domain": true
  }
}
```

The TUI displays actual security status per port.

### Important Security Notes

- Never commit `NGROK_AUTH_TOKEN` to version control
- Use environment variables or user config files (`~/.yardmaster/config.json`)
- User config files are stored in home directory, outside repository
- Public ngrok tunnels without authentication are accessible by anyone
- Always use authentication or IP restrictions for production services

## Troubleshooting

### "Failed to initialize ngrok"

**Cause:** Auth token not set or invalid

**Solution:**
1. Verify token: `echo $NGROK_AUTH_TOKEN`
2. Validate at https://dashboard.ngrok.com/get-started/your-authtoken
3. Check for typos (tokens are 48+ characters)
4. Set in `~/.yardmaster/config.json` as alternative

### "No available ports in range"

**Cause:** All ports in range (3000-9000 by default) are occupied

**Solution:**
1. List active: `yardmaster list`
2. Release unused: `yardmaster release <app_name>`
3. Expand range: Set `PORT_RANGE_START` and `PORT_RANGE_END`
4. Check system processes: `lsof -i :3000-9000`

### "Port already in use"

**Cause:** Port is registered to another application

**Solution:**
1. Check registration: `yardmaster list`
2. Release existing: `yardmaster release <app_name>`
3. Use auto-assignment (omit port number)

### MCP Server Not Responding

**Cause:** Path error, missing token, or server crash

**Solution:**
1. Use absolute path in MCP config (not relative)
2. Verify `NGROK_AUTH_TOKEN` in `env` section or global environment
3. Test manually: `node /absolute/path/to/yardmaster/dist/index.js`
4. Check MCP logs (location varies by client)
5. Restart AI client

### Invalid Input Errors

**NGROK_BASIC_AUTH format:**
- Must be `username:password` (colon-separated)
- Example: `NGROK_BASIC_AUTH="admin:secure123"`
- Both username and password required

**NGROK_IP_ALLOW/DENY format:**
- CIDR notation: `IP/prefix`
- Single IP: `1.2.3.4/32`
- Multiple: `1.2.3.4/32,10.0.0.0/8` (comma-separated)
- IPv6 supported: `2001:db8::/32`
- Prefix range: 0-32 (IPv4), 0-128 (IPv6)

## Development

### Setup

```bash
npm install
npm run build
```

### Scripts

- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm test` - Run test suite
- `npm run lint` - ESLint
- `npm run type-check` - TypeScript validation

### Testing

**TypeScript Tests** (21 tests):
- Input validation (basic auth, CIDR notation)
- IPv4 and IPv6 validation
- Edge case handling

**Go Tests** (4 tests):
- Registry file parsing
- JSON error handling
- Port filtering

Run tests:

```bash
# TypeScript
npm test

# Go
cd tui && go test ./...
```

### Build TUI

```bash
cd tui
go build -ldflags="-s -w" -o yardmaster-tui
```

The `-ldflags="-s -w"` flags strip debug symbols, reducing binary size by 30%.

### Project Structure

```
yardmaster/
├── src/              # TypeScript source
│   ├── registry.ts   # Port allocation
│   ├── ngrok-manager.ts  # Tunnel management
│   ├── validation.ts # Input validation
│   └── index.ts      # MCP server
├── tui/              # Go TUI application
│   ├── internal/
│   │   ├── models/   # State management
│   │   ├── registry/ # Registry parser
│   │   └── ui/       # View renderers
│   └── main.go
├── config/           # Default configuration
└── dist/             # Compiled JavaScript
```

## Roadmap

### Completed Features

- Custom ngrok domains and subdomains
- Authentication (Basic Auth, IP restrictions)
- Terminal UI with bubbletea
- File locking for concurrency safety
- Event-driven file watching (fsnotify)
- Input validation with error messages
- Test suite (25 tests total)
- Pagination for large port lists

### Planned Features

- Web Dashboard (browser-based UI)
- Multi-Machine Aggregation (shared registry across machines)
- Analytics (port usage metrics and history)
- Docker Integration (auto-discover containerized apps)
- Webhooks (notifications on port events)
- Database Backend (SQLite/Postgres instead of JSON)
- Team Features (multi-user/organization support)

## Performance

- **Registry capacity**: Tested with 1000+ ports
- **Pagination**: 20 ports per page in TUI
- **File watching**: Event-driven updates (zero polling overhead)
- **Binary size**: 3.3MB (TUI), stripped
- **Startup time**: <100ms for CLI operations
- **Concurrency**: Thread-safe with file locking (Node.js and Go)

## License

MIT

## Contributing

Issues and pull requests are welcome. Please include tests for new features.

For bug reports, include:
- Operating system and version
- Node.js version
- Error messages (if any)
- Steps to reproduce

---

**Repository**: https://github.com/croakingtoad/yardmaster

Built by LOCOMOTIVE

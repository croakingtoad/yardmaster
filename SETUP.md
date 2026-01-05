# Yardmaster Setup Guide

## Prerequisites

- Node.js 18+ or Bun
- ngrok account (free tier works)

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd yardmaster
npm install
npm run build
```

### 2. Get ngrok Auth Token

1. Go to https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your auth token

### 3. Configure Auth Token

**Option A: Environment Variable (Recommended)**

```bash
export NGROK_AUTH_TOKEN="your_token_here"
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc):

```bash
echo 'export NGROK_AUTH_TOKEN="your_token_here"' >> ~/.bashrc
source ~/.bashrc
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

### 4. Verify Setup

```bash
# Build the project
npm run build

# Test CLI
node dist/cli.js status

# Expected output:
# 🚂 Yardmaster Status
# ──────────────────────────────────────────────────
# Port Range: 3000 - 9000
# Registry Path: ~/.yardmaster/registry.json
# Active Registrations: 0
# ngrok Region: us
# ngrok Auth Token: xxxxxxxx...
# ──────────────────────────────────────────────────
```

## Optional: Make CLI Globally Available

```bash
npm link
# Now you can use: yardmaster <command>
```

Or add to PATH:

```bash
echo 'export PATH="$PATH:/path/to/yardmaster/dist"' >> ~/.bashrc
```

## Usage

### CLI

```bash
# Register a port (auto-assign)
yardmaster register myapp

# Register specific port
yardmaster register myapp 3000

# List all registered ports
yardmaster list

# Release a port
yardmaster release myapp

# Show status
yardmaster status
```

### MCP Server

Add to your MCP config (`claude_desktop_config.json` or similar):

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

## Configuration

### Port Range

Default: 3000-9000

**Environment Variables**:
```bash
export PORT_RANGE_START=4000
export PORT_RANGE_END=5000
```

**User Config** (`~/.yardmaster/config.json`):
```json
{
  "port_range": {
    "start": 4000,
    "end": 5000
  }
}
```

### ngrok Region

Default: `us`

Change via user config:
```json
{
  "ngrok": {
    "region": "eu"
  }
}
```

Available regions: `us`, `eu`, `ap`, `au`, `sa`, `jp`, `in`

## Troubleshooting

### "Failed to initialize ngrok"

**Cause**: Auth token not set or invalid

**Fix**:
1. Verify token is set: `echo $NGROK_AUTH_TOKEN`
2. Check token is valid at https://dashboard.ngrok.com
3. Try setting in user config file instead

### "No available ports in range"

**Cause**: All ports in range are occupied

**Fix**:
1. Release unused ports: `yardmaster list` then `yardmaster release <app>`
2. Expand port range in config
3. Check for processes using ports: `lsof -i :3000-9000`

### MCP Server Not Responding

**Cause**: Incorrect path or missing auth token

**Fix**:
1. Verify absolute path in MCP config
2. Check `NGROK_AUTH_TOKEN` is in `env` section of MCP config
3. Check logs: `tail -f ~/.mcp/logs/yardmaster.log`

## Security Notes

⚠️ **NEVER commit your ngrok auth token to git**

- Use environment variables
- Add `.env` to `.gitignore` (already done)
- User config files (`~/.yardmaster/config.json`) are in your home directory, not the repo

## Next Steps

- Read [README.md](README.md) for detailed usage
- See [PHASE2.md](PHASE2.md) for upcoming features
- Report issues on GitHub

---

**Need Help?** Open an issue or check the documentation.

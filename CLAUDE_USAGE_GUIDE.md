# How to Ensure Claude Uses Yardmaster

This guide explains how to make sure Claude (and other AI agents) actually **use Yardmaster** when they need ports, instead of picking random ports that might conflict.

## The Problem

AI agents often need to:
1. Start development servers (React, Next.js, Vite, etc.)
2. Run backend APIs
3. Create ngrok tunnels
4. Test webhooks

Without Yardmaster, they:
- Pick random ports (3000, 8080, 5173, etc.)
- Don't check for conflicts
- Can't coordinate across sessions
- Have to manually manage ngrok

## The Solution: Train Claude to Use Yardmaster

### Method 1: Add to Project CLAUDE.md (Recommended)

Create or update `/path/to/your/project/CLAUDE.md`:

```markdown
# Project Instructions for Claude

## Port Management - MANDATORY

**BEFORE starting ANY development server**, you MUST:

1. Check available ports: `mcp.callTool('yardmaster', 'query_ports')`
2. Register your port: `mcp.callTool('yardmaster', 'register_port', {app_name: 'your-app-name'})`
3. Use the returned port and ngrok URL
4. NEVER hardcode port 3000, 8080, 5173, or any other port
5. When done: `mcp.callTool('yardmaster', 'release_port', {app_name: 'your-app-name'})`

**Example**:
\`\`\`javascript
// ❌ WRONG - Don't do this
npm run dev  // Uses hardcoded port 3000

// ✅ CORRECT - Do this
const result = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'frontend'
});
// Returns: { port: 3001, ngrok_url: "https://abc123.ngrok.app" }

// Update vite.config.ts to use result.port
// Start dev server on that port
// Share result.ngrok_url with user
\`\`\`

## Why This Matters

- Prevents port conflicts
- Automatic ngrok tunnels
- Coordination across sessions
- No manual port management
```

### Method 2: Add to Global ~/.claude/CLAUDE.md

For ALL projects, add to `~/.claude/CLAUDE.md`:

```markdown
## Port Management Protocol

**CRITICAL**: Before starting any development server, API, or service:

1. **Query existing ports**: `mcp.callTool('yardmaster', 'query_ports')`
2. **Register new port**: `mcp.callTool('yardmaster', 'register_port', {app_name: 'descriptive-name'})`
3. **Use returned port**: Configure your dev server to use the assigned port
4. **Share ngrok URL**: Tell user their app is available at the ngrok URL
5. **Release when done**: `mcp.callTool('yardmaster', 'release_port', {app_name: 'name'})`

Never assume port 3000/8080/5173 is available. Always use Yardmaster.
```

### Method 3: Remind Claude in Your Prompt

When starting a new session:

```
"I need to create a React app. Remember to use Yardmaster to register
a port before starting the dev server."
```

Or add it to your custom instructions in Claude Desktop.

## Workflow Examples

### Example 1: Starting a New React App

**User**: "Create a new React app with Vite"

**Claude should do**:
```typescript
// 1. Register port first
const portResult = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'my-react-app'
});
// Returns: { port: 3000, ngrok_url: "https://xyz.ngrok.app" }

// 2. Create Vite app
npm create vite@latest my-react-app -- --template react-ts

// 3. Configure Vite to use assigned port
// Edit vite.config.ts:
export default defineConfig({
  server: { port: 3000 }  // Use portResult.port
})

// 4. Start dev server
npm run dev

// 5. Tell user
"✅ React app running on port 3000
   Public URL: https://xyz.ngrok.app"
```

### Example 2: Running Multiple Services

**User**: "Start frontend on React and backend API"

**Claude should do**:
```typescript
// 1. Query existing ports
const existing = await mcp.callTool('yardmaster', 'query_ports');

// 2. Register frontend
const frontend = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'frontend'
});
// Returns: { port: 3000, ngrok_url: "https://front.ngrok.app" }

// 3. Register backend
const backend = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'backend-api'
});
// Returns: { port: 3001, ngrok_url: "https://api.ngrok.app" }

// 4. Configure both apps with their ports
// 5. Start both services
// 6. Tell user both URLs
```

### Example 3: Port Conflict Detected

**Claude tries**:
```typescript
const result = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'frontend',
  desired_port: 3000
});
// Returns: { success: false, message: "Port 3000 already in use by 'api'" }
```

**Claude should then**:
```typescript
// 1. Either auto-assign
const result = await mcp.callTool('yardmaster', 'register_port', {
  app_name: 'frontend'  // No desired_port, will auto-assign
});

// 2. Or ask user to release existing port
"Port 3000 is in use by 'api'. Options:
1. I can auto-assign a different port (e.g., 3001)
2. You can release the 'api' port first
Which would you prefer?"
```

## Testing Claude's Compliance

### Test 1: Basic Port Registration

Ask Claude: "Start a Next.js dev server"

**Expected behavior**:
1. Claude calls `register_port` first
2. Configures Next.js with assigned port
3. Shares ngrok URL
4. Does NOT hardcode port 3000

**Verify**:
```bash
yardmaster list
# Should show the registered port
```

### Test 2: Multiple Services

Ask Claude: "Run frontend and backend simultaneously"

**Expected behavior**:
1. Claude registers TWO separate ports
2. Configures each service correctly
3. Shares both ngrok URLs

**Verify**:
```bash
yardmaster list
# Should show both registrations
```

### Test 3: Port Conflict Handling

```bash
# Manually register port 3000
yardmaster register blocking-app 3000
```

Then ask Claude: "Start a React app on port 3000"

**Expected behavior**:
1. Claude attempts to register port 3000
2. Receives error about conflict
3. Auto-assigns different port OR asks user what to do
4. Does NOT force start on 3000 (which would fail)

## Troubleshooting: Claude Not Using Yardmaster

### Symptom: Claude starts servers without Yardmaster

**Solution 1**: Add to project CLAUDE.md (see Method 1 above)

**Solution 2**: Interrupt and remind:
```
"Stop! Before starting the dev server, use Yardmaster to register a port first.
Call the register_port MCP tool."
```

**Solution 3**: Check MCP config is loaded:
```bash
# Restart Claude Desktop app
# Check: Settings → Developer → MCP Servers
# Should show "yardmaster" in the list
```

### Symptom: Claude says "Yardmaster tool not found"

**Cause**: MCP server not loaded

**Solution**:
1. Verify config: `cat ~/.config/Claude/claude_desktop_config.json`
2. Should contain "yardmaster" entry
3. Restart Claude Desktop app
4. Check Developer tools for MCP errors

### Symptom: Port conflicts still happening

**Cause**: Old sessions didn't release ports

**Solution**:
```bash
# Clean up stale registrations
yardmaster list
yardmaster release <stale-app-name>
```

Or add to CLAUDE.md:
```markdown
**At session end**: Always call `release_port` for all registered apps
```

## Advanced: Making It Automatic

### Option 1: Pre-task Hook (Future Enhancement)

Create a hook that auto-checks ports before any `npm start` / `npm run dev`:

```bash
# .claude/hooks/pre-task.sh
if [[ "$COMMAND" == *"npm start"* ]] || [[ "$COMMAND" == *"npm run dev"* ]]; then
  echo "⚠️  STOP! Use Yardmaster to register port first!"
  exit 1
fi
```

### Option 2: Wrapper Scripts

Instead of `npm run dev`, create `dev.sh`:

```bash
#!/bin/bash
# dev.sh - Yardmaster-aware dev server

# Register port via CLI
RESULT=$(yardmaster register $(basename $PWD))
PORT=$(echo $RESULT | grep -oP 'Port \K\d+')
NGROK=$(echo $RESULT | grep -oP 'ngrok URL: \K.*')

# Set environment
export PORT=$PORT
export VITE_PORT=$PORT
export NEXT_PUBLIC_PORT=$PORT

# Start dev server
npm run dev

# Cleanup on exit
trap "yardmaster release $(basename $PWD)" EXIT
```

Then Claude can run `./dev.sh` instead of `npm run dev`.

## Best Practices for Users

### 1. Start Each Session with Query

Add to your workflow:
```
User: "Show me what ports are currently in use"
Claude: [calls query_ports]
```

### 2. Clean Up at Session End

Before ending a session:
```
User: "Release all the ports we registered"
Claude: [calls release_port for each app]
```

### 3. Add to Project README

Document for other developers:
```markdown
## Development Setup

This project uses Yardmaster for port management.

**Starting dev server**:
1. Ports are managed via Yardmaster (ask Claude)
2. Claude will register a port and provide ngrok URL
3. Never hardcode ports in configs

**Manual usage**:
\`\`\`bash
yardmaster register myapp     # Get assigned port
yardmaster list               # See all registrations
yardmaster release myapp      # Release when done
\`\`\`
```

## Integration with Other Tools

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "label": "Start Dev Server (Yardmaster)",
  "type": "shell",
  "command": "yardmaster register ${workspaceFolderBasename} && npm run dev",
  "problemMatcher": []
}
```

### Docker Compose

```yaml
services:
  frontend:
    build: .
    command: sh -c "PORT=$(yardmaster register frontend | grep -oP 'Port \\K\\d+') npm start"
    environment:
      - USE_YARDMASTER=true
```

## Summary: The Golden Rules

1. **Query First**: Always check existing registrations before starting
2. **Register Always**: Never start a server without registering its port
3. **Use Assigned Port**: Configure your app to use the port Yardmaster assigns
4. **Share ngrok URL**: Give users the public URL, not localhost
5. **Release When Done**: Clean up registrations at session end

---

**Next Steps**:
1. Add port management rules to your project's CLAUDE.md
2. Test with a new Claude session
3. Verify Claude registers ports before starting servers
4. Enjoy conflict-free development! 🚂

# Yardmaster Activity Logging

## Overview

Yardmaster includes a comprehensive activity logging system that records all port management and ngrok tunnel operations. The logs are stored in JSON Lines (JSONL) format for easy parsing and analysis.

## Log Location

```
~/.yardmaster/logs/activity.log
```

The log directory is automatically created on first use.

## Log Format

Each log entry is a single JSON object on its own line (JSONL format):

```json
{"timestamp":"2026-01-06T22:00:50.437Z","event":"register","app":"test-app","port":3000,"details":{"success":true}}
```

## Event Types

### 1. Register Event
Logged when a port is registered for an application.

```json
{
  "timestamp": "2026-01-06T22:00:50.437Z",
  "event": "register",
  "app": "myapp",
  "port": 3000,
  "url": "https://abc123.ngrok.io",
  "details": {"success": true}
}
```

**Fields:**
- `timestamp`: ISO 8601 UTC timestamp
- `event`: Always `"register"`
- `app`: Application name
- `port`: Registered port number
- `url`: Ngrok URL (optional, may be added after tunnel creation)
- `details.success`: Always `true` for successful operations

### 2. Release Event
Logged when a port registration is released.

```json
{
  "timestamp": "2026-01-06T22:00:50.454Z",
  "event": "release",
  "app": "myapp",
  "port": 3000,
  "details": {"success": true}
}
```

### 3. Tunnel Created Event
Logged when an ngrok tunnel is successfully created.

```json
{
  "timestamp": "2026-01-06T22:00:50.449Z",
  "event": "tunnel_created",
  "app": "myapp",
  "port": 3000,
  "url": "https://abc123.ngrok.io",
  "details": {"success": true}
}
```

### 4. Tunnel Closed Event
Logged when an ngrok tunnel is closed.

```json
{
  "timestamp": "2026-01-06T22:00:50.459Z",
  "event": "tunnel_closed",
  "app": "myapp",
  "port": 3000,
  "details": {"success": true}
}
```

### 5. Error Event
Logged when an error occurs during operations.

```json
{
  "timestamp": "2026-01-06T22:00:50.470Z",
  "event": "error",
  "app": "failing-app",
  "port": 3002,
  "message": "Connection refused",
  "details": {
    "code": "ECONNREFUSED",
    "attempt": 3,
    "success": false
  }
}
```

**Fields:**
- `message`: Human-readable error message
- `details`: Additional error context (error code, retry attempts, etc.)
- `details.success`: Always `false` for errors

## Viewing Logs

### View Raw Logs
```bash
cat ~/.yardmaster/logs/activity.log
```

### Pretty Print with jq
```bash
cat ~/.yardmaster/logs/activity.log | jq
```

### Filter by Event Type
```bash
# Show only register events
cat ~/.yardmaster/logs/activity.log | jq 'select(.event == "register")'

# Show only errors
cat ~/.yardmaster/logs/activity.log | jq 'select(.event == "error")'
```

### Filter by Application
```bash
cat ~/.yardmaster/logs/activity.log | jq 'select(.app == "myapp")'
```

### Filter by Port
```bash
cat ~/.yardmaster/logs/activity.log | jq 'select(.port == 3000)'
```

### Show Recent Events
```bash
# Last 10 events
tail -n 10 ~/.yardmaster/logs/activity.log | jq
```

### Count Events by Type
```bash
cat ~/.yardmaster/logs/activity.log | jq -r '.event' | sort | uniq -c
```

## Integration with TUI

The TUI log viewer reads this log file and displays events in real-time. See `tui/IMPLEMENTATION_PLAN.md` for details on the Go-based log viewer implementation.

## Log Rotation

Currently, logs are appended indefinitely. For production use, consider implementing log rotation:

```bash
# Using logrotate (example)
cat > /etc/logrotate.d/yardmaster << EOF
~/.yardmaster/logs/activity.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
EOF
```

## Error Handling

The logger is designed to fail gracefully:
- If the log directory cannot be created, errors are written to stderr
- Log write failures do NOT crash the application
- Failed log writes are reported to console.error but operations continue

## Implementation Details

### Source Files
- `src/logger.ts` - Core logging implementation
- `src/registry.ts` - Logs port register/release events
- `src/ngrok-manager.ts` - Logs tunnel create/close/error events

### Testing
Run the test suite:
```bash
npm test
```

Run integration test:
```bash
npx tsx test-logging.ts
```

## Zero Mock Policy

The logging system follows yardmaster's "Zero Mock Policy":
- Real file I/O operations only
- Real timestamps using `new Date().toISOString()`
- Real directory creation with `fs.mkdir()`
- Real file appending with `fs.appendFile()`
- No mock logging or console.log fallbacks in production code

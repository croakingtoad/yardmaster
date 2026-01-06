# TUI Admin Menu - Implementation Plan

## Current Status

### Completed Features
- [x] Menu navigation with keyboard (up/down, j/k)
- [x] Menu selection with Enter
- [x] Release Selected - Fully functional
- [x] About screen - Fully functional
- [x] Quit action - Fully functional
- [x] Detail view shortcuts (E/D/C) - D works, E/C show Phase 2 messages

### Remaining Features (5 items)

## 1. Register New Port

**Priority**: High
**Complexity**: Medium

### Requirements
- Interactive form with text inputs
- Fields: App Name (required), Port (optional - auto-assign if blank)
- Validation: App name non-empty, port in valid range
- Preview of configuration before submission
- Call yardmaster CLI or directly create registration

### Implementation Steps
1. Create form state in Model:
   - `FormField` enum (AppName, Port, Security options)
   - `FormValues` struct with input data
   - `CurrentField` for tracking active input
2. Create `newport_form.go` renderer:
   - Input boxes with cursor
   - Field labels
   - Validation errors inline
   - Submit/Cancel buttons
3. Add form navigation:
   - Tab/Shift+Tab to cycle fields
   - Enter to submit (if valid)
   - Esc to cancel
4. Execute registration:
   - Option A: Call `yardmaster register <app> [port]`
   - Option B: Direct registry write (requires duplicating TypeScript logic)
   - Recommendation: Use Option A (CLI) for consistency

### Files to Create/Modify
- `tui/internal/models/form.go` - Form state and validation
- `tui/internal/ui/newport.go` - Update with real form rendering
- `tui/internal/models/app.go` - Add form field navigation handlers

---

## 2. Edit Security

**Priority**: Medium
**Complexity**: High

### Requirements
- Edit security settings for selected port
- Fields: Enable/Disable Basic Auth, IP Allow/Deny lists
- Read current config from registry security field
- Apply changes and re-create tunnel with new settings

### Challenges
- Registry stores security STATUS (enabled: true/false) but not VALUES (username:password)
- Actual auth values are in env vars or config file, not registry
- Re-creating tunnel requires stopping old one and creating new one
- Changes must persist across restarts

### Implementation Options

**Option A: Env Var Override (Recommended)**
- Show current security status from registry
- Prompt user to update environment variables
- Display instructions: "Set NGROK_BASIC_AUTH=user:pass and restart services"
- Don't actually change values (they're in env/config, not registry)

**Option B: Per-Port Security Config**
- Extend registry schema to store security values per port
- Requires major refactor of TypeScript code
- Security values in JSON file (less secure than env vars)
- Complex: need to restart ngrok tunnel with new settings

**Recommendation**: Start with Option A (show current, guide user to change env vars)

### Files to Create/Modify
- `tui/internal/ui/security.go` - Security settings view
- Show current settings, guide user on how to change them
- Maybe future: allow editing and store in registry

---

## 3. View Logs

**Priority**: Low
**Complexity**: Medium

### Requirements
- Show activity logs for ports
- Events: Register, Release, Tunnel Created, Tunnel Closed, Errors
- Filter by port/app name
- Real-time updates
- Scrollable log viewer

### Challenges
- **Logs don't exist yet!** Registry only stores current state, not history
- Need to implement logging system first

### Implementation Steps

**Phase 1: Add Logging System**
1. Create log file: `~/.yardmaster/logs/activity.log`
2. Update TypeScript code to log events:
   - `registry.ts`: Log register/release
   - `ngrok-manager.ts`: Log tunnel create/close/errors
3. Log format: JSON Lines (JSONL) for easy parsing
   - `{"timestamp":"2026-01-06T20:00:00Z","event":"register","app":"myapp","port":3000}`

**Phase 2: Log Viewer UI**
1. Create `tui/internal/logs/reader.go` - Parse JSONL log file
2. Create `tui/internal/ui/logs.go` - Render log view
3. Add filtering by app name or port
4. Add pagination (show last 100 entries)
5. Auto-refresh on file changes (fsnotify)

### Files to Create
- `src/logger.ts` - TypeScript logging utility
- `tui/internal/logs/reader.go` - Go log parser
- `tui/internal/ui/logs.go` - Log viewer UI
- Update: `src/registry.ts`, `src/ngrok-manager.ts` to call logger

---

## 4. Configuration

**Priority**: Medium
**Complexity**: Medium

### Requirements
- View and edit TUI settings
- Settings: Page size, refresh interval (if we add polling fallback), theme/colors
- Save preferences to `~/.yardmaster/tui-config.json`
- Reload settings on startup

### Implementation Steps
1. Create TUI config structure:
   ```go
   type TUIConfig struct {
       PageSize      int
       Theme         string  // "dark" or "light"
       ShowTimestamps bool
       RefreshFallback int   // Seconds, 0 = disabled
   }
   ```
2. Create config file handler:
   - `tui/internal/config/config.go` - Load/save TUI preferences
3. Create settings UI:
   - `tui/internal/ui/settings.go` - Settings screen with editable fields
4. Apply settings:
   - Update Model.PageSize dynamically
   - Reload colors for theme changes

### Files to Create
- `tui/internal/config/config.go` - TUI config management
- `tui/internal/ui/settings.go` - Settings screen
- `tui/internal/models/app.go` - Add config to Model

---

## 5. Export Registry

**Priority**: Low
**Complexity**: Low

### Requirements
- Export current registry to file
- Formats: JSON (full), CSV (simplified)
- Save to user-specified location or default: `~/yardmaster-export-YYYYMMDD.json`
- Include all fields: app name, port, ngrok URL, status, registered time, security

### Implementation Steps
1. Create export dialog:
   - Prompt for filename (with default)
   - Choose format: JSON or CSV
2. CSV format:
   ```csv
   app_name,port,ngrok_url,status,registered_at,basic_auth,ip_restrictions,custom_domain
   myapp,3000,https://abc.ngrok.app,active,2026-01-06T10:00:00Z,true,false,true
   ```
3. JSON format:
   - Pretty-printed full registry data
4. Write to file with error handling

### Files to Create
- `tui/internal/export/exporter.go` - Export logic
- `tui/internal/ui/export.go` - Export dialog/confirmation
- Update `tui/internal/models/app.go` - Add export command

---

## Implementation Order (Recommended)

### Phase 2A: Quick Wins (1-2 hours)
1. **Export Registry** - Simplest, low risk
2. **Configuration** - Useful for customization

### Phase 2B: Complex Features (4-6 hours)
3. **Register New Port** - Most requested, medium complexity
4. **View Logs** - Requires logging system first (backend + frontend)

### Phase 2C: Advanced (Future)
5. **Edit Security** - Complex, requires architecture decisions

---

## Technical Decisions Needed

### 1. Clipboard Support
For "Copy URL" (C key):
- **Option A**: Use `github.com/atotto/clipboard` (cross-platform)
- **Option B**: Shell out to `xclip` (Linux), `pbcopy` (Mac), `clip` (Windows)
- **Recommendation**: Option A for simplicity

### 2. Logging Backend
For "View Logs":
- **Option A**: JSONL file (`~/.yardmaster/logs/activity.log`)
- **Option B**: SQLite database
- **Option C**: Both (JSONL for simple, SQLite for queries)
- **Recommendation**: Start with Option A (JSONL)

### 3. Form Input Library
For "Register New Port" form:
- **Option A**: Use `github.com/charmbracelet/bubbles` textinput component
- **Option B**: Custom implementation
- **Recommendation**: Option A (battle-tested, accessible)

### 4. Security Edit Approach
For "Edit Security":
- **Option A**: Read-only view + guide user to update env vars
- **Option B**: Per-port override in registry (complex refactor)
- **Recommendation**: Option A for Phase 2, Option B for Phase 3

---

## Dependencies to Add

```bash
# For Register New Port form
cd tui
go get github.com/charmbracelet/bubbles/textinput

# For Copy URL functionality
go get github.com/atotto/clipboard

# For View Logs (if implementing)
# No new dependencies needed (use stdlib)
```

---

## Testing Plan

### Manual Tests
1. **Register New Port**:
   - Enter valid app name → success
   - Enter invalid port (99999) → error shown
   - Leave port blank → auto-assigns
   - Cancel with Esc → returns to list

2. **Export Registry**:
   - Export as JSON → file created with valid JSON
   - Export as CSV → file created with correct columns
   - File already exists → prompt to overwrite

3. **Configuration**:
   - Change page size to 10 → list shows 10 items
   - Change theme → colors update immediately
   - Settings persist → restart TUI, settings still applied

4. **View Logs**:
   - Register port → event appears in logs
   - Release port → event appears
   - Filter by app name → shows only matching events
   - Scroll through 1000+ log entries → no performance issues

### Automated Tests
- `form_test.go` - Form validation logic
- `export_test.go` - JSON and CSV generation
- `config_test.go` - Config file load/save
- `logs_test.go` - Log parsing and filtering

---

## Estimated Effort

| Feature | Effort | Dependencies | Risk |
|---------|--------|--------------|------|
| Export Registry | 1-2 hours | None | Low |
| Configuration | 2-3 hours | None | Low |
| Register New Port | 3-4 hours | bubbles/textinput | Medium |
| View Logs | 4-6 hours | Logging system | Medium |
| Edit Security | 6-8 hours | Architecture decision | High |

**Total**: 16-23 hours for all features

---

## Next Steps

1. Fix "E" key handler (DONE - added placeholder message)
2. Add bubbles/textinput dependency
3. Implement Register New Port form
4. Add Export Registry functionality
5. Create logging system
6. Build log viewer
7. Add Configuration screen
8. Design Edit Security approach

Recommend starting with Export Registry (quick win) then Register New Port (most useful).

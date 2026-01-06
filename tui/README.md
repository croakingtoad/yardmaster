# Yardmaster TUI

A terminal user interface (TUI) for managing yardmaster port registrations, built with [bubbletea](https://github.com/charmbracelet/bubbletea).

## Features

- **📊 Real-time Port List**: View all active port registrations with event-driven updates
- **🔍 Port Details**: Inspect detailed information about each registered port
- **⌨️ Keyboard Navigation**: Vim-style keyboard shortcuts for efficient navigation
- **🎨 Beautiful UI**: Styled with lipgloss for a modern terminal experience
- **🔄 Live Updates**: Registry automatically updates using fsnotify (no polling!)
- **🔒 Security Display**: Shows actual auth and IP restriction status per port
- **📄 Pagination**: Handle large port lists with 20 items per page
- **🛡️ Thread Safe**: File locking prevents corruption from concurrent access
- **✅ Error Handling**: Clear error messages displayed in UI

## Installation

### From Source

```bash
cd tui
go build -o yardmaster-tui
./yardmaster-tui
```

### Installing Globally

```bash
cd tui
go install
```

This will install `yardmaster-tui` to your `$GOPATH/bin`.

## Usage

Simply run the TUI:

```bash
yardmaster-tui
```

### Keyboard Shortcuts

#### List View
- `↑/↓` or `k/j` - Navigate up/down
- `←/→` or `h/l` - Previous/next page (when multiple pages)
- `Enter` - View port details
- `M` - Open admin menu
- `R` - Manually refresh registry
- `Q` or `Ctrl+C` - Quit

#### Detail View
- `Esc` - Return to list view
- `Q` - Quit

#### Menu View
- `Esc` - Close menu
- `Enter` - Select menu item (coming soon)

## Architecture

```
tui/
├── main.go                  # Application entry point
├── internal/
│   ├── models/
│   │   └── app.go          # Bubbletea model with state & logic
│   ├── registry/
│   │   ├── types.go        # Registry data structures
│   │   └── reader.go       # JSON registry parser
│   └── ui/
│       ├── list.go         # Main list view renderer
│       ├── detail.go       # Port detail view renderer
│       ├── newport.go      # New port form (future)
│       └── menu.go         # Admin menu renderer
└── README.md
```

## How It Works

1. **Registry Reader**: Reads `~/.yardmaster/registry.json` with file locking
2. **File Watching**: Uses fsnotify for event-driven updates (no polling!)
3. **Bubbletea Model**: Manages application state using Elm architecture
   - `Init()` - Starts file watcher
   - `Update()` - Processes keyboard events and file change events
   - `View()` - Renders UI based on current state
4. **Thread Safety**: Shared locks for reads, exclusive locks for writes
5. **Pagination**: Displays 20 ports per page for large registries
6. **Security Display**: Reads security metadata from registry
7. **Styling**: Uses lipgloss for colors, borders, and layout

## Future Features (Phase 2+)

### Completed
- ✅ **Port Details View** - Complete with security info
- ✅ **Pagination** - Handle large port lists (20 per page)
- ✅ **File Watching** - Event-driven updates with fsnotify
- ✅ **Security Display** - Shows actual auth/IP/domain settings
- ✅ **Error Handling** - User-visible error messages
- ✅ **Thread Safety** - File locking prevents corruption

### Planned Enhancements
- ⏳ **Delete/Release Ports** - Call `yardmaster release` command
- ⏳ **New Port Registration** - Interactive form to register new ports
- ⏳ **Edit Security Settings** - Update auth/IP restrictions
- ⏳ **Copy URL** - Copy ngrok URL to clipboard
- ⏳ **Test Connection** - Ping ngrok endpoint
- ⏳ **View Logs** - Show port activity logs
- ⏳ **Export Registry** - Export to JSON/CSV
- ⏳ **Configuration** - TUI settings (page size, theme, etc.)

### Advanced Features
- **Auto-detect Ports**: Discover ports not registered in yardmaster
- **Port Filtering**: Search and filter by name, port, status
- **Sorting**: Sort by name, port, date, etc.
- **Batch Operations**: Select multiple ports for bulk actions
- **Help Screen**: Comprehensive keyboard shortcut reference
- **Status Indicators**: Show tunnel health, traffic stats

## Development

### Prerequisites
- Go 1.21+
- Access to `~/.yardmaster/registry.json`

### Running in Development

```bash
go run main.go
```

### Building

```bash
go build -o yardmaster-tui
```

### Adding New Features

1. **Add State**: Update `models.Model` struct
2. **Handle Events**: Add cases to `Update()` method
3. **Render UI**: Create or update render functions in `ui/` package
4. **Test**: Build and run the TUI

## Troubleshooting

### "Error loading registry"
- Ensure yardmaster is installed and configured
- Check that `~/.yardmaster/registry.json` exists
- Try running `yardmaster list` first to create registry

### Display Issues
- Ensure terminal supports UTF-8
- Try different terminal emulators (iTerm2, Alacritty, etc.)
- Terminal must support 256 colors

### Build Errors
- Run `go mod tidy` to sync dependencies
- Ensure Go 1.21+ is installed

## Testing

Run the test suite:

```bash
go test ./...
```

Run tests with verbose output:

```bash
go test -v ./...
```

Tests cover:
- Registry file parsing with valid/invalid JSON
- Empty registry handling
- Active port filtering
- File locking behavior

## Dependencies

- [bubbletea](https://github.com/charmbracelet/bubbletea) - TUI framework
- [lipgloss](https://github.com/charmbracelet/lipgloss) - Styling library
- [fsnotify](https://github.com/fsnotify/fsnotify) - File system notifications

## License

MIT (same as parent yardmaster project)

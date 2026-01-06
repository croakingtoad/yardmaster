package models

import (
	"fmt"
	"os/exec"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/croakingtoad/yardmaster/tui/internal/registry"
	"github.com/fsnotify/fsnotify"
)

// ViewMode represents the current screen being displayed
type ViewMode int

const (
	ViewList ViewMode = iota
	ViewDetail
	ViewNewPort
	ViewMenu
	ViewAbout
)

type tickMsg time.Time
type fileChangeMsg struct{}

// Model represents the application state for bubbletea
type Model struct {
	// Data
	Registry     *registry.RegistryData
	Ports        []registry.PortRegistration
	RegistryPath string

	// UI State
	CurrentView ViewMode
	Cursor      int
	Selected    int
	Width       int
	Height      int
	MenuOpen    bool
	MenuCursor  int
	Page        int
	PageSize    int

	// Reader
	Reader  *registry.Reader
	Watcher *fsnotify.Watcher

	// Status
	Error       error
	Message     string
	LastUpdated time.Time
}

// NewModel creates a new application model
func NewModel() (*Model, error) {
	reader, err := registry.NewReader()
	if err != nil {
		return nil, err
	}

	// Create file watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &Model{
		Reader:      reader,
		Watcher:     watcher,
		CurrentView: ViewList,
		Cursor:      0,
		Selected:    -1,
		Page:        0,
		PageSize:    20, // Show 20 ports per page
		LastUpdated: time.Now(),
	}, nil
}

// Close cleans up resources
func (m *Model) Close() error {
	if m.Watcher != nil {
		return m.Watcher.Close()
	}
	return nil
}

// WatchRegistry sets up file watching for the registry
func (m *Model) WatchRegistry(registryPath string) error {
	m.RegistryPath = registryPath
	return m.Watcher.Add(registryPath)
}

// WaitForFileChange waits for file system events
func waitForFileChange(watcher *fsnotify.Watcher) tea.Cmd {
	return func() tea.Msg {
		select {
		case event := <-watcher.Events:
			if event.Op&fsnotify.Write == fsnotify.Write {
				return fileChangeMsg{}
			}
		case <-watcher.Errors:
			// Ignore errors, will retry on next event
		}
		return nil
	}
}

// RefreshData reloads the registry data
func (m *Model) RefreshData() error {
	reg, err := m.Reader.Read()
	if err != nil {
		m.Error = err
		return err
	}

	m.Registry = reg
	m.Error = nil
	m.LastUpdated = time.Now()

	// Convert map to sorted slice for display
	m.Ports = make([]registry.PortRegistration, 0, len(reg.Ports))
	for _, port := range reg.Ports {
		if port.Status == "active" {
			m.Ports = append(m.Ports, port)
		}
	}

	// Clamp cursor and selected to valid bounds after refresh
	m.ClampCursor()
	m.ClampSelected()

	return nil
}

// ClampCursor ensures cursor is within valid range
func (m *Model) ClampCursor() {
	if m.Cursor < 0 {
		m.Cursor = 0
	}
	if len(m.Ports) == 0 {
		m.Cursor = 0
	} else if m.Cursor >= len(m.Ports) {
		m.Cursor = len(m.Ports) - 1
	}
}

// ClampSelected ensures selected index is valid or resets to invalid
func (m *Model) ClampSelected() {
	if m.Selected < 0 {
		return // Already invalid
	}
	if len(m.Ports) == 0 || m.Selected >= len(m.Ports) {
		// Selection no longer valid, return to list view
		m.Selected = -1
		m.CurrentView = ViewList
	}
}

// GetSelectedPort safely returns the selected port if valid
func (m *Model) GetSelectedPort() *registry.PortRegistration {
	if m.Selected < 0 || m.Selected >= len(m.Ports) {
		return nil
	}
	return &m.Ports[m.Selected]
}

// GetPagedPorts returns the ports for the current page
func (m *Model) GetPagedPorts() []registry.PortRegistration {
	start := m.Page * m.PageSize
	end := start + m.PageSize

	if start >= len(m.Ports) {
		return []registry.PortRegistration{}
	}

	if end > len(m.Ports) {
		end = len(m.Ports)
	}

	return m.Ports[start:end]
}

// GetTotalPages returns the total number of pages
func (m *Model) GetTotalPages() int {
	if len(m.Ports) == 0 {
		return 1
	}
	return (len(m.Ports) + m.PageSize - 1) / m.PageSize
}

// NextPage moves to the next page if available
func (m *Model) NextPage() {
	if m.Page < m.GetTotalPages()-1 {
		m.Page++
		m.Cursor = 0
	}
}

// PrevPage moves to the previous page if available
func (m *Model) PrevPage() {
	if m.Page > 0 {
		m.Page--
		m.Cursor = 0
	}
}

// Init implements tea.Model
func (m *Model) Init() tea.Cmd {
	// Start watching for file changes
	return waitForFileChange(m.Watcher)
}

// Update implements tea.Model
func (m *Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			if m.CurrentView == ViewList && !m.MenuOpen {
				return m, tea.Quit
			}
			if m.MenuOpen {
				m.MenuOpen = false
				return m, nil
			}
			if m.CurrentView != ViewList {
				m.CurrentView = ViewList
				m.Selected = -1
				return m, nil
			}
			return m, tea.Quit

		case "r":
			if m.CurrentView == ViewList && !m.MenuOpen {
				m.RefreshData()
				m.Message = "Registry refreshed"
				return m, nil
			}

		case "up", "k":
			if m.MenuOpen {
				// Navigate menu
				if m.MenuCursor > 0 {
					m.MenuCursor--
					// Skip separator lines
					if m.MenuCursor == 4 || m.MenuCursor == 7 {
						m.MenuCursor--
					}
				}
			} else if m.Cursor > 0 {
				m.Cursor--
			}

		case "down", "j":
			if m.MenuOpen {
				// Navigate menu (10 items total, 0-9)
				if m.MenuCursor < 9 {
					m.MenuCursor++
					// Skip separator lines at indices 4 and 7
					if m.MenuCursor == 4 || m.MenuCursor == 7 {
						m.MenuCursor++
					}
				}
			} else {
				pagedPorts := m.GetPagedPorts()
				if m.Cursor < len(pagedPorts)-1 {
					m.Cursor++
				}
			}

		case "left", "h":
			if m.CurrentView == ViewList && !m.MenuOpen {
				m.PrevPage()
			}

		case "right", "l":
			if m.CurrentView == ViewList && !m.MenuOpen {
				m.NextPage()
			}

		case "enter":
			if m.MenuOpen {
				// Handle menu selection
				return m.HandleMenuSelection()
			} else if m.CurrentView == ViewList {
				pagedPorts := m.GetPagedPorts()
				if m.Cursor < len(pagedPorts) {
					// Calculate actual index in full ports array
					actualIndex := m.Page*m.PageSize + m.Cursor
					m.Selected = actualIndex
					m.CurrentView = ViewDetail
				}
			}

		case "e":
			// Edit key in detail view
			if m.CurrentView == ViewDetail {
				m.Message = "Edit Security - Coming in Phase 2"
				return m, nil
			}

		case "d":
			// Delete key in detail view
			if m.CurrentView == ViewDetail {
				port := m.GetSelectedPort()
				if port != nil {
					m.CurrentView = ViewList
					return m.ReleaseSelectedPort()
				}
			}

		case "c":
			// Copy URL in detail view
			if m.CurrentView == ViewDetail {
				port := m.GetSelectedPort()
				if port != nil && port.NgrokURL != nil {
					m.Message = "Copy to clipboard - Coming in Phase 2 (URL: " + *port.NgrokURL + ")"
				} else {
					m.Message = "No ngrok URL to copy"
				}
				return m, nil
			}

		case "esc":
			if m.MenuOpen {
				m.MenuOpen = false
			} else if m.CurrentView != ViewList {
				m.CurrentView = ViewList
				m.Selected = -1
			}

		case "m":
			if m.CurrentView == ViewList {
				m.MenuOpen = !m.MenuOpen
				if m.MenuOpen {
					// Reset menu cursor to first item when opening
					m.MenuCursor = 0
				}
			}
		}

	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height

	case fileChangeMsg:
		// Registry file changed, reload data
		if err := m.RefreshData(); err != nil {
			// Error already set in RefreshData, continue watching
		}
		// Continue watching for next change
		return m, waitForFileChange(m.Watcher)

	case releaseResultMsg:
		if msg.success {
			m.Message = fmt.Sprintf("Released port for '%s'", msg.appName)
			m.Error = nil
			// Refresh data to show updated registry
			m.RefreshData()
		} else {
			m.Error = msg.error
			m.Message = ""
		}
		return m, nil
	}

	return m, nil
}

// HandleMenuSelection processes menu item selection
func (m *Model) HandleMenuSelection() (*Model, tea.Cmd) {
	// Menu items: 0-Register, 1-Release, 2-EditSec, 3-Logs, 4-SEP, 5-Config, 6-Export, 7-SEP, 8-About, 9-Quit
	switch m.MenuCursor {
	case 0: // Register New Port
		m.MenuOpen = false
		m.CurrentView = ViewNewPort
		m.Message = ""
		return m, nil

	case 1: // Release Selected
		return m.ReleaseSelectedPort()

	case 2: // Edit Security
		m.Message = "Edit Security - Coming in Phase 2"
		m.MenuOpen = false
		return m, nil

	case 3: // View Logs
		m.Message = "View Logs - Coming in Phase 2"
		m.MenuOpen = false
		return m, nil

	case 5: // Configuration
		m.Message = "Configuration - Coming in Phase 2"
		m.MenuOpen = false
		return m, nil

	case 6: // Export Registry
		m.Message = "Export Registry - Coming in Phase 2"
		m.MenuOpen = false
		return m, nil

	case 8: // About
		m.MenuOpen = false
		m.CurrentView = ViewAbout
		return m, nil

	case 9: // Quit
		return m, tea.Quit

	default:
		return m, nil
	}
}

// ReleaseSelectedPort releases the currently selected port
func (m *Model) ReleaseSelectedPort() (*Model, tea.Cmd) {
	if m.Cursor < 0 || m.Cursor >= len(m.GetPagedPorts()) {
		m.Error = fmt.Errorf("no port selected")
		m.MenuOpen = false
		return m, nil
	}

	// Get actual port from paged list
	actualIndex := m.Page*m.PageSize + m.Cursor
	if actualIndex >= len(m.Ports) {
		m.Error = fmt.Errorf("invalid port selection")
		m.MenuOpen = false
		return m, nil
	}

	port := m.Ports[actualIndex]

	// Close menu and return command to execute release
	m.MenuOpen = false
	return m, releasePortCmd(port.AppName)
}

// releasePortCmd creates a command that calls yardmaster CLI to release port
func releasePortCmd(appName string) tea.Cmd {
	return func() tea.Msg {
		cmd := exec.Command("yardmaster", "release", appName)
		output, err := cmd.CombinedOutput()

		if err != nil {
			return releaseResultMsg{
				success: false,
				appName: appName,
				error:   fmt.Errorf("release failed: %v - %s", err, string(output)),
			}
		}

		return releaseResultMsg{
			success: true,
			appName: appName,
		}
	}
}

type releaseResultMsg struct {
	success bool
	appName string
	error   error
}

// View implements tea.Model - will be provided by ui package
func (m *Model) View() string {
	return ""
}

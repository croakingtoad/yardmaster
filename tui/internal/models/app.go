package models

import (
	"fmt"
	"os/exec"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/croakingtoad/yardmaster/tui/internal/config"
	"github.com/croakingtoad/yardmaster/tui/internal/export"
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
	ViewExport         // Export Registry feature
	ViewSettings       // Configuration feature
	ViewLogs           // View Logs feature
	ViewSecurityStatus // Security status feature
	ViewSecurityConfig // Global ngrok security configuration feature
)

type tickMsg time.Time
type fileChangeMsg struct{}
type logFileChangeMsg struct{}

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

	// Form State (Register New Port)
	Form *FormState

	// Export State
	ExportFormatIndex    int
	ExportFilename       string
	ExportFilenameEdit   bool
	ExportFilenameCursor int

	// Configuration State
	Config         *config.TUIConfig
	SettingsCursor int
	OriginalConfig *config.TUIConfig // Backup for cancel

	// Log State
	LogEntries     []interface{} // Will be []logs.LogEntry but avoid import cycle
	LogScroll      int
	LogCursor      int
	LogFilter      string
	LogFilterMode  bool
	LogFilterInput string
	LogReader      interface{} // Will be *logs.Reader but avoid import cycle
	LogWatcher     *fsnotify.Watcher

	// Security Status State
	SecurityStatusAppName string
	SecurityStatus        *registry.SecurityInfo
	SecurityConfig        *SecurityConfigState

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

	// Load configuration
	cfg, err := config.LoadConfig()
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
		PageSize:    cfg.PageSize, // Load from config
		Config:      cfg,
		LastUpdated: time.Now(),
	}, nil
}

// Close cleans up resources
func (m *Model) Close() error {
	var err error
	if m.Watcher != nil {
		err = m.Watcher.Close()
	}
	if m.LogWatcher != nil {
		if logErr := m.LogWatcher.Close(); logErr != nil && err == nil {
			err = logErr
		}
	}
	return err
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
	// Handle form input when in NewPort view
	if m.CurrentView == ViewNewPort && m.Form != nil {
		return m.handleFormInput(msg)
	}
	if m.CurrentView == ViewSecurityConfig && m.SecurityConfig != nil {
		return m.handleSecurityConfigInput(msg)
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Handle log filter input mode
		if m.LogFilterMode {
			switch msg.String() {
			case "enter":
				m.LogFilter = m.LogFilterInput
				m.LogFilterMode = false
				m.LogScroll = 0
				m.LogCursor = 0
				return m, nil
			case "esc":
				m.LogFilterMode = false
				m.LogFilterInput = ""
				return m, nil
			case "backspace":
				if len(m.LogFilterInput) > 0 {
					m.LogFilterInput = m.LogFilterInput[:len(m.LogFilterInput)-1]
				}
				return m, nil
			default:
				// Add typed character to filter
				if len(msg.String()) == 1 {
					m.LogFilterInput += msg.String()
				}
				return m, nil
			}
		}

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
			if m.CurrentView == ViewLogs {
				return m, refreshLogsCmd(m)
			}

		case "up", "k":
			if m.CurrentView == ViewLogs {
				if m.LogScroll > 0 {
					m.LogScroll--
					m.LogCursor--
				}
			} else if m.CurrentView == ViewSettings {
				// Navigate settings
				if m.SettingsCursor > 0 {
					m.SettingsCursor--
				}
			} else if m.CurrentView == ViewExport && !m.ExportFilenameEdit {
				// Navigate export format selection
				if m.ExportFormatIndex > 0 {
					m.ExportFormatIndex--
					m.UpdateExportFilenameExtension()
				}
			} else if m.MenuOpen {
				// Navigate menu
				if m.MenuCursor > 0 {
					m.MenuCursor--
					// Skip separator lines
					if m.MenuCursor == 4 || m.MenuCursor == 8 {
						m.MenuCursor--
					}
				}
			} else if m.Cursor > 0 {
				m.Cursor--
			}

		case "down", "j":
			if m.CurrentView == ViewLogs {
				if m.LogEntries != nil && m.LogScroll < len(m.LogEntries)-1 {
					m.LogScroll++
					m.LogCursor++
				}
			} else if m.CurrentView == ViewSettings {
				// Navigate settings (0-4: PageSize, Theme, Timestamps, Refresh, Save)
				if m.SettingsCursor < 4 {
					m.SettingsCursor++
				}
			} else if m.CurrentView == ViewExport && !m.ExportFilenameEdit {
				// Navigate export format selection
				if m.ExportFormatIndex < 1 { // 0=JSON, 1=CSV
					m.ExportFormatIndex++
					m.UpdateExportFilenameExtension()
				}
			} else if m.MenuOpen {
				// Navigate menu (11 items total, 0-10)
				if m.MenuCursor < 10 {
					m.MenuCursor++
					// Skip separator lines at indices 4 and 8
					if m.MenuCursor == 4 || m.MenuCursor == 8 {
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
			if m.CurrentView == ViewSettings {
				// Adjust setting value down/left
				return m.AdjustSetting(-1)
			} else if m.CurrentView == ViewList && !m.MenuOpen {
				m.PrevPage()
			}

		case "right", "l":
			if m.CurrentView == ViewSettings {
				// Adjust setting value up/right
				return m.AdjustSetting(1)
			} else if m.CurrentView == ViewList && !m.MenuOpen {
				m.NextPage()
			}

		case "enter":
			if m.MenuOpen {
				// Handle menu selection
				return m.HandleMenuSelection()
			} else if m.CurrentView == ViewSettings {
				// Save settings
				if m.SettingsCursor == 4 {
					// Save button pressed
					return m.SaveSettings()
				}
			} else if m.CurrentView == ViewExport && m.ExportFilenameEdit {
				// Stop editing filename on enter
				m.ExportFilenameEdit = false
			} else if m.CurrentView == ViewExport && !m.ExportFilenameEdit {
				// Perform export
				return m.PerformExport()
			} else if m.CurrentView == ViewList {
				pagedPorts := m.GetPagedPorts()
				if m.Cursor < len(pagedPorts) {
					// Calculate actual index in full ports array
					actualIndex := m.Page*m.PageSize + m.Cursor
					m.Selected = actualIndex
					m.CurrentView = ViewDetail
				}
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

		case "f":
			if m.CurrentView == ViewExport {
				m.ExportFilenameEdit = !m.ExportFilenameEdit
				if m.ExportFilenameEdit {
					m.ExportFilenameCursor = len(m.ExportFilename)
				}
			}

		case "/":
			if m.CurrentView == ViewLogs {
				m.LogFilterMode = true
				m.LogFilterInput = m.LogFilter
				return m, nil
			}

		case "x":
			if m.CurrentView == ViewLogs && !m.LogFilterMode {
				m.LogFilter = ""
				m.LogFilterInput = ""
				m.LogScroll = 0
				m.LogCursor = 0
				return m, nil
			}

		case "backspace":
			if m.CurrentView == ViewExport && m.ExportFilenameEdit {
				if m.ExportFilenameCursor > 0 {
					// Remove character before cursor
					m.ExportFilename = m.ExportFilename[:m.ExportFilenameCursor-1] + m.ExportFilename[m.ExportFilenameCursor:]
					m.ExportFilenameCursor--
				}
			}

		case "delete":
			if m.CurrentView == ViewExport && m.ExportFilenameEdit {
				if m.ExportFilenameCursor < len(m.ExportFilename) {
					// Remove character at cursor
					m.ExportFilename = m.ExportFilename[:m.ExportFilenameCursor] + m.ExportFilename[m.ExportFilenameCursor+1:]
				}
			}

		case "s":
			if m.CurrentView == ViewDetail {
				if port := m.GetSelectedPort(); port != nil {
					m.showSecurityStatus(*port)
				}
				return m, nil
			}

		case "esc":
			if m.CurrentView == ViewSecurityStatus {
				if m.GetSelectedPort() != nil {
					m.CurrentView = ViewDetail
				} else {
					m.CurrentView = ViewList
				}
				m.Message = ""
				return m, nil
			}
			if m.CurrentView == ViewSettings {
				// Cancel settings - restore original config
				if m.OriginalConfig != nil {
					m.Config = m.OriginalConfig
					m.PageSize = m.Config.PageSize
					m.OriginalConfig = nil
				}
				m.CurrentView = ViewList
				m.Message = "Settings canceled"
				return m, nil
			}
			if m.CurrentView == ViewExport && m.ExportFilenameEdit {
				// Stop editing filename
				m.ExportFilenameEdit = false
			} else if m.MenuOpen {
				m.MenuOpen = false
			} else if m.CurrentView != ViewList {
				// Return to list view
				m.CurrentView = ViewList
				m.Selected = -1
				m.Error = nil
				m.Message = ""
			}

		case "m":
			if m.CurrentView == ViewList {
				m.MenuOpen = !m.MenuOpen
				if m.MenuOpen {
					// Reset menu cursor to first item when opening
					m.MenuCursor = 0
				}
			}

		default:
			// Handle text input for filename editing
			if m.CurrentView == ViewExport && m.ExportFilenameEdit {
				// Only allow printable characters
				if len(msg.String()) == 1 {
					char := msg.String()
					// Insert character at cursor position
					m.ExportFilename = m.ExportFilename[:m.ExportFilenameCursor] + char + m.ExportFilename[m.ExportFilenameCursor:]
					m.ExportFilenameCursor++
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

	case registerResultMsg:
		// Handle registration result
		if msg.success {
			m.Message = fmt.Sprintf("Successfully registered '%s' on port %s", msg.appName, msg.port)
			m.Error = nil
			m.Form = nil
			m.CurrentView = ViewList
			// Refresh data to show new registration
			m.RefreshData()
		} else {
			m.Error = msg.error
			m.Message = ""
		}
		return m, nil

	case loadLogsMsg:
		return m, nil
	}

	return m, nil
}

// HandleMenuSelection processes menu item selection
func (m *Model) HandleMenuSelection() (*Model, tea.Cmd) {
	// Menu items: 0-Register, 1-Release, 2-Security, 3-Logs, 4-SEP,
	// 5-Config, 6-Ngrok Security, 7-Export, 8-SEP, 9-About, 10-Quit.
	switch m.MenuCursor {
	case 0: // Register New Port
		m.MenuOpen = false
		m.CurrentView = ViewNewPort
		m.Message = ""
		// Initialize form state
		formState := NewFormState()
		m.Form = &formState
		return m, nil

	case 1: // Release Selected
		return m.ReleaseSelectedPort()

	case 2: // Security Status
		m.MenuOpen = false
		// Check if a port is selected
		if m.Cursor < 0 || m.Cursor >= len(m.GetPagedPorts()) {
			m.Message = "Please select a port first"
			return m, nil
		}

		// Get the selected port
		actualIndex := m.Page*m.PageSize + m.Cursor
		if actualIndex >= len(m.Ports) {
			m.Message = "Invalid port selection"
			return m, nil
		}

		port := m.Ports[actualIndex]

		m.showSecurityStatus(port)
		return m, nil

	case 3: // View Logs
		m.MenuOpen = false
		m.CurrentView = ViewLogs
		m.LogScroll = 0
		m.LogCursor = 0
		return m, initLogsCmd(m)

	case 5: // Configuration
		m.MenuOpen = false
		m.CurrentView = ViewSettings
		m.SettingsCursor = 0
		// Backup current config for cancel
		m.OriginalConfig = &config.TUIConfig{
			PageSize:        m.Config.PageSize,
			Theme:           m.Config.Theme,
			ShowTimestamps:  m.Config.ShowTimestamps,
			RefreshFallback: m.Config.RefreshFallback,
		}
		m.Message = ""
		return m, nil

	case 6: // Global Ngrok Security
		m.MenuOpen = false
		m.CurrentView = ViewSecurityConfig
		state := NewSecurityConfigState()
		m.SecurityConfig = &state
		m.Message = ""
		m.Error = nil
		return m, loadSecurityConfigCmd(defaultYardmasterRunner)

	case 7: // Export Registry
		m.MenuOpen = false
		m.CurrentView = ViewExport
		m.Message = ""
		// Initialize export state with default filename
		if defaultFile, err := export.GetDefaultFilename(export.FormatJSON); err == nil {
			m.ExportFilename = defaultFile
		}
		m.ExportFormatIndex = 0 // Default to JSON
		m.ExportFilenameEdit = false
		m.ExportFilenameCursor = len(m.ExportFilename)
		return m, nil

	case 9: // About
		m.MenuOpen = false
		m.CurrentView = ViewAbout
		return m, nil

	case 10: // Quit
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

type registerResultMsg struct {
	success bool
	appName string
	port    string
	error   error
}

type loadLogsMsg struct{}

type logsLoadedMsg struct {
	entries []interface{}
	error   error
}

// handleFormInput processes input for the new port registration form
func (m *Model) handleFormInput(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc":
			// Cancel form and return to list
			m.CurrentView = ViewList
			m.Form = nil
			m.Message = ""
			m.Error = nil
			return m, nil

		case "tab":
			// Move to next field
			if m.Form != nil {
				m.Form.NextField()
			}
			return m, nil

		case "shift+tab":
			// Move to previous field
			if m.Form != nil {
				m.Form.PrevField()
			}
			return m, nil

		case "enter":
			// Handle button actions or form submission
			if m.Form != nil {
				switch m.Form.CurrentField {
				case FormFieldSubmit:
					// Validate and submit form
					if err := m.Form.Validate(); err != nil {
						m.Form.ValidationError = err.Error()
						return m, nil
					}
					// Execute register command
					appName := m.Form.GetAppName()
					port := m.Form.GetPort()
					return m, registerPortCmd(appName, port)

				case FormFieldCancel:
					// Cancel and return to list
					m.CurrentView = ViewList
					m.Form = nil
					m.Message = ""
					m.Error = nil
					return m, nil
				}
			}
			return m, nil
		}

		// Update the active text input
		if m.Form != nil {
			switch m.Form.CurrentField {
			case FormFieldAppName:
				m.Form.AppNameInput, cmd = m.Form.AppNameInput.Update(msg)
				// Clear validation error on input
				m.Form.ValidationError = ""
				return m, cmd

			case FormFieldPort:
				m.Form.PortInput, cmd = m.Form.PortInput.Update(msg)
				// Clear validation error on input
				m.Form.ValidationError = ""
				return m, cmd
			}
		}

	case registerResultMsg:
		// Handle registration result
		if msg.success {
			m.Message = fmt.Sprintf("Successfully registered '%s' on port %s", msg.appName, msg.port)
			m.Error = nil
			m.Form = nil
			m.CurrentView = ViewList
			// Refresh data to show new registration
			m.RefreshData()
		} else {
			m.Error = msg.error
			m.Message = ""
		}
		return m, nil
	}

	return m, cmd
}

// registerPortCmd creates a command that calls yardmaster CLI to register port
func registerPortCmd(appName, port string) tea.Cmd {
	return func() tea.Msg {
		var cmd *exec.Cmd
		if port == "" {
			// Auto-assign port
			cmd = exec.Command("yardmaster", "register", appName)
		} else {
			// Use specified port
			cmd = exec.Command("yardmaster", "register", appName, port)
		}

		output, err := cmd.CombinedOutput()

		if err != nil {
			return registerResultMsg{
				success: false,
				appName: appName,
				port:    port,
				error:   fmt.Errorf("registration failed: %v - %s", err, string(output)),
			}
		}

		return registerResultMsg{
			success: true,
			appName: appName,
			port:    port,
		}
	}
}

// UpdateExportFilenameExtension updates the file extension based on selected format
func (m *Model) UpdateExportFilenameExtension() {
	// Determine new extension based on format index
	var newExt string
	if m.ExportFormatIndex == 0 {
		newExt = ".json"
	} else {
		newExt = ".csv"
	}

	// Replace extension in filename
	filename := m.ExportFilename
	// Find last dot
	lastDot := -1
	for i := len(filename) - 1; i >= 0; i-- {
		if filename[i] == '.' {
			lastDot = i
			break
		}
	}

	if lastDot != -1 {
		m.ExportFilename = filename[:lastDot] + newExt
	} else {
		m.ExportFilename = filename + newExt
	}

	// Reset cursor to end of filename
	m.ExportFilenameCursor = len(m.ExportFilename)
}

// PerformExport executes the export operation
func (m *Model) PerformExport() (*Model, tea.Cmd) {
	if m.Registry == nil {
		m.Error = fmt.Errorf("no registry data to export")
		return m, nil
	}

	// Get export format
	var format export.ExportFormat
	if m.ExportFormatIndex == 0 {
		format = export.FormatJSON
	} else {
		format = export.FormatCSV
	}

	// Create exporter and export
	exporter := export.NewExporter(m.Registry)
	if err := exporter.Export(m.ExportFilename, format); err != nil {
		m.Error = fmt.Errorf("export failed: %w", err)
		m.Message = ""
		return m, nil
	}

	// Success - return to list view
	m.Message = fmt.Sprintf("Exported to %s", m.ExportFilename)
	m.Error = nil
	m.CurrentView = ViewList
	return m, nil
}

// AdjustSetting adjusts the current setting value
func (m *Model) AdjustSetting(delta int) (*Model, tea.Cmd) {
	switch m.SettingsCursor {
	case 0: // Page Size
		newSize := m.Config.PageSize + delta*5
		if newSize < 5 {
			newSize = 5
		} else if newSize > 100 {
			newSize = 100
		}
		m.Config.PageSize = newSize
		m.PageSize = newSize // Update model page size too

	case 1: // Theme
		if m.Config.Theme == "dark" {
			m.Config.Theme = "light"
		} else {
			m.Config.Theme = "dark"
		}

	case 2: // Show Timestamps
		m.Config.ShowTimestamps = !m.Config.ShowTimestamps

	case 3: // Refresh Fallback
		newRefresh := m.Config.RefreshFallback + delta*5
		if newRefresh < 0 {
			newRefresh = 0
		} else if newRefresh > 300 {
			newRefresh = 300
		}
		m.Config.RefreshFallback = newRefresh
	}

	return m, nil
}

// SaveSettings saves the current configuration to disk
func (m *Model) SaveSettings() (*Model, tea.Cmd) {
	if err := config.SaveConfig(m.Config); err != nil {
		m.Error = err
		m.Message = ""
		return m, nil
	}

	m.OriginalConfig = nil
	m.CurrentView = ViewList
	m.Message = "Settings saved successfully"
	m.Error = nil
	return m, nil
}

// initLogsCmd initializes the log viewer by loading logs and setting up watching
func initLogsCmd(m *Model) tea.Cmd {
	return func() tea.Msg {
		// Import logs package here to avoid import cycle
		// This will be called at runtime
		return loadLogsMsg{}
	}
}

// refreshLogsCmd reloads the logs
func refreshLogsCmd(m *Model) tea.Cmd {
	return func() tea.Msg {
		return loadLogsMsg{}
	}
}

func (m *Model) showSecurityStatus(port registry.PortRegistration) {
	m.SecurityStatusAppName = port.AppName
	m.SecurityStatus = port.Security
	m.CurrentView = ViewSecurityStatus
	m.Message = ""
}

// View implements tea.Model - will be provided by ui package
func (m *Model) View() string {
	return ""
}

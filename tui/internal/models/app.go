package models

import (
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
			if m.Cursor > 0 {
				m.Cursor--
			}

		case "down", "j":
			pagedPorts := m.GetPagedPorts()
			if m.Cursor < len(pagedPorts)-1 {
				m.Cursor++
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
			if m.CurrentView == ViewList && !m.MenuOpen {
				pagedPorts := m.GetPagedPorts()
				if m.Cursor < len(pagedPorts) {
					// Calculate actual index in full ports array
					actualIndex := m.Page*m.PageSize + m.Cursor
					m.Selected = actualIndex
					m.CurrentView = ViewDetail
				}
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
	}

	return m, nil
}

// View implements tea.Model - will be provided by ui package
func (m *Model) View() string {
	return ""
}

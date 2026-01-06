package models

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/croakingtoad/yardmaster/tui/internal/registry"
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

	// Reader
	Reader *registry.Reader

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

	return &Model{
		Reader:      reader,
		CurrentView: ViewList,
		Cursor:      0,
		Selected:    -1,
		LastUpdated: time.Now(),
	}, nil
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

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second*5, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

// Init implements tea.Model
func (m *Model) Init() tea.Cmd {
	return tickCmd()
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
			if m.Cursor < len(m.Ports)-1 {
				m.Cursor++
			}

		case "enter":
			if m.CurrentView == ViewList && !m.MenuOpen {
				if m.Cursor < len(m.Ports) {
					m.Selected = m.Cursor
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

	case tickMsg:
		// Handle refresh errors but don't crash - error is stored in m.Error
		if err := m.RefreshData(); err != nil {
			// Error already set in RefreshData, just continue
		}
		return m, tickCmd()
	}

	return m, nil
}

// View implements tea.Model - will be provided by ui package
func (m *Model) View() string {
	return ""
}

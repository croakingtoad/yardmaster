package ui

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// logEntryWrapper wraps the interface{} to logs.LogEntry conversion
type logEntryWrapper struct {
	Timestamp string                 `json:"timestamp"`
	Event     string                 `json:"event"`
	App       string                 `json:"app"`
	Port      int                    `json:"port"`
	URL       string                 `json:"url,omitempty"`
	Message   string                 `json:"message,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// convertToLogEntry converts interface{} to logEntryWrapper
func convertToLogEntry(entry interface{}) (*logEntryWrapper, error) {
	// Marshal and unmarshal to convert
	data, err := json.Marshal(entry)
	if err != nil {
		return nil, err
	}

	var wrapped logEntryWrapper
	if err := json.Unmarshal(data, &wrapped); err != nil {
		return nil, err
	}

	return &wrapped, nil
}

var (
	logHeaderStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("39")).
			BorderStyle(lipgloss.NormalBorder()).
			BorderBottom(true).
			BorderForeground(lipgloss.Color("240"))

	logRegisterStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("42")) // Green

	logReleaseStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("203")) // Red

	logTunnelCreateStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("39")) // Blue

	logTunnelCloseStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("214")) // Orange

	logErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("196")).
			Bold(true) // White text on red background

	logOtherStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("250")) // Gray

	logSelectedStyle = lipgloss.NewStyle().
				Background(lipgloss.Color("237")).
				Bold(true)

	logFilterStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("226")).
			Bold(true)

	logHelpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("244"))

	logInfoStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("39"))
)

// RenderLogsView renders the logs viewer
func RenderLogsView(m *models.Model) string {
	var b strings.Builder

	// Header
	header := "Yardmaster Activity Logs"
	if m.LogFilter != "" {
		header += fmt.Sprintf(" (Filter: %s)", m.LogFilter)
	}
	b.WriteString(logHeaderStyle.Width(m.Width).Render(header))
	b.WriteString("\n\n")

	// Show loading or error state
	if m.LogEntries == nil {
		if m.Error != nil {
			b.WriteString(errorStyle.Render(fmt.Sprintf("Error loading logs: %v", m.Error)))
		} else {
			b.WriteString("Loading logs...")
		}
		b.WriteString("\n\n")
		b.WriteString(logHelpStyle.Render("Press ESC or Q to return"))
		return b.String()
	}

	// Convert interface{} entries to wrapped entries
	wrappedEntries := make([]*logEntryWrapper, 0, len(m.LogEntries))
	for _, e := range m.LogEntries {
		wrapped, err := convertToLogEntry(e)
		if err != nil {
			continue
		}
		wrappedEntries = append(wrappedEntries, wrapped)
	}

	// Apply filter
	filteredEntries := wrappedEntries
	if m.LogFilter != "" {
		filteredEntries = filterLogEntries(wrappedEntries, m.LogFilter)
	}

	// Show empty state
	if len(filteredEntries) == 0 {
		if m.LogFilter != "" {
			b.WriteString(warningStyle.Render("No logs match filter: " + m.LogFilter))
		} else {
			b.WriteString(logInfoStyle.Render("No logs yet. Activity will appear here."))
		}
		b.WriteString("\n\n")
		b.WriteString(logHelpStyle.Render("Press ESC or Q to return • Press R to refresh"))
		return b.String()
	}

	// Calculate visible window
	contentHeight := m.Height - 8 // Reserve space for header, footer, padding
	startIdx := m.LogScroll
	endIdx := startIdx + contentHeight
	if endIdx > len(filteredEntries) {
		endIdx = len(filteredEntries)
	}
	if startIdx > len(filteredEntries) {
		startIdx = len(filteredEntries) - contentHeight
		if startIdx < 0 {
			startIdx = 0
		}
	}

	// Render log entries
	for i := startIdx; i < endIdx; i++ {
		entry := filteredEntries[i]
		line := formatLogEntry(entry, i == m.LogCursor)
		b.WriteString(line)
		b.WriteString("\n")
	}

	// Footer with scroll info and help
	b.WriteString("\n")
	scrollInfo := fmt.Sprintf("Showing %d-%d of %d", startIdx+1, endIdx, len(filteredEntries))
	if m.LogFilter != "" {
		scrollInfo += fmt.Sprintf(" (filtered from %d total)", len(m.LogEntries))
	}
	b.WriteString(logHelpStyle.Render(scrollInfo))
	b.WriteString("\n")

	// Help text
	helpText := "↑/↓ or J/K: Scroll • /: Filter • X: Clear filter • R: Refresh • ESC/Q: Back"
	if m.LogFilterMode {
		helpText = "Type to filter • ENTER: Apply • ESC: Cancel"
		b.WriteString(logFilterStyle.Render("Filter: "+m.LogFilterInput+"█"))
		b.WriteString("\n")
	}
	b.WriteString(logHelpStyle.Render(helpText))

	return b.String()
}

// filterLogEntries filters log entries by text
func filterLogEntries(entries []*logEntryWrapper, filterText string) []*logEntryWrapper {
	if filterText == "" {
		return entries
	}

	var filtered []*logEntryWrapper
	filterLower := strings.ToLower(filterText)

	for _, entry := range entries {
		// Match against app name, port, or event
		if strings.Contains(strings.ToLower(entry.App), filterLower) ||
			fmt.Sprintf("%d", entry.Port) == filterText ||
			strings.Contains(strings.ToLower(entry.Event), filterLower) {
			filtered = append(filtered, entry)
		}
	}

	return filtered
}

// formatLogEntry formats a single log entry for display
func formatLogEntry(entry *logEntryWrapper, selected bool) string {
	timestamp := formatTimestamp(entry.Timestamp)
	eventType := getEventType(entry.Event)

	// Select style based on event type
	var eventStyle lipgloss.Style
	var eventIcon string

	switch eventType {
	case "register":
		eventStyle = logRegisterStyle
		eventIcon = "✓"
	case "release":
		eventStyle = logReleaseStyle
		eventIcon = "✗"
	case "tunnel_created":
		eventStyle = logTunnelCreateStyle
		eventIcon = "↗"
	case "tunnel_closed":
		eventStyle = logTunnelCloseStyle
		eventIcon = "↙"
	case "error":
		eventStyle = logErrorStyle
		eventIcon = "⚠"
	default:
		eventStyle = logOtherStyle
		eventIcon = "•"
	}

	// Format the line
	eventStr := fmt.Sprintf("%s %-15s", eventIcon, entry.Event)
	appStr := fmt.Sprintf("%-20s", entry.App)
	portStr := ""
	if entry.Port > 0 {
		portStr = fmt.Sprintf(":%d", entry.Port)
	}

	// Build message
	msg := entry.Message
	if entry.Error != "" {
		msg = entry.Error
	}
	if entry.URL != "" && msg == "" {
		msg = entry.URL
	}

	line := fmt.Sprintf("%s  %s  %s%-6s  %s",
		timestamp,
		eventStyle.Render(eventStr),
		appStr,
		portStr,
		msg,
	)

	// Apply selection highlight
	if selected {
		line = logSelectedStyle.Render(line)
	}

	return line
}

// formatTimestamp formats a log timestamp for display
func formatTimestamp(timestamp string) string {
	t, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return timestamp
	}
	return t.Format("2006-01-02 15:04:05")
}

// getEventType categorizes an event for rendering
func getEventType(event string) string {
	switch strings.ToLower(event) {
	case "register", "registered":
		return "register"
	case "release", "released":
		return "release"
	case "tunnel_created", "tunnel_create", "ngrok_started":
		return "tunnel_created"
	case "tunnel_closed", "tunnel_close", "ngrok_stopped":
		return "tunnel_closed"
	case "error":
		return "error"
	default:
		return "other"
	}
}

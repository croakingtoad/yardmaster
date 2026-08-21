package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

var (
	// Railway Professional Color Scheme
	// Brand: Railway Blue (#5B9BD5), Amber Accent (#F4A261)

	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#5B9BD5")). // Railway Blue
			Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#F4A261")). // Amber Accent
			Foreground(lipgloss.Color("#1E293B")). // Dark slate for contrast
			Bold(true).
			Padding(0, 1)

	normalStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#E2E8F0")). // Soft white
			Padding(0, 1)

	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#5B9BD5")) // Railway Blue (replaces harsh cyan)

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#6EE7B7")) // Mint green (replaces harsh green)

	mutedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#64748B")) // Muted slate

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#5B9BD5")). // Railway Blue
			Padding(1, 2)
)

var (
	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F87171")). // Soft coral (replaces harsh red)
			Bold(true)

	warningStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FCD34D")) // Warm amber

	// Additional semantic styles
	labelStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#94A3B8")) // Secondary text for labels

	valueStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#E2E8F0")). // Primary text
			Bold(true)

	highlightStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F4A261")). // Amber accent for key values
			Bold(true)

	urlStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#60A5FA")). // Sky blue for URLs
			Underline(true)

	processStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#60A5FA")) // Info blue for process details

	pathStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#7DD3FC")). // Lighter sky blue
			Italic(true)

	securityEnabledStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#6EE7B7")) // Mint = secured

	securityDisabledStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#64748B")) // Muted = not secured
)

// RenderListView renders the main port list view
func RenderListView(m *models.Model) string {
	var b strings.Builder

	// Title
	title := titleStyle.Render("🚂 Yardmaster TUI")
	b.WriteString(title + "\n\n")

	// Show error if any
	if m.Error != nil {
		errorMsg := errorStyle.Render(fmt.Sprintf("⚠️  Error: %s", m.Error.Error()))
		b.WriteString(errorMsg + "\n\n")
	}

	// Show message if any
	if m.Message != "" {
		msgStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#60A5FA")) // Info blue
		b.WriteString(msgStyle.Render(fmt.Sprintf("ℹ️  %s", m.Message)) + "\n\n")
	}

	// Header with pagination info
	totalPages := m.GetTotalPages()
	pageInfo := ""
	if totalPages > 1 {
		pageInfo = fmt.Sprintf(" • Page %d/%d", m.Page+1, totalPages)
	}
	header := headerStyle.Render(fmt.Sprintf("📊 Active Port Registrations (%d)%s", len(m.Ports), pageInfo))
	b.WriteString(header + "\n\n")

	// Get paged ports
	pagedPorts := m.GetPagedPorts()

	// Port list
	if len(pagedPorts) == 0 {
		if len(m.Ports) == 0 {
			b.WriteString(mutedStyle.Render("  No active ports registered"))
		} else {
			b.WriteString(mutedStyle.Render("  No ports on this page"))
		}
		b.WriteString("\n")
	} else {
		for i, port := range pagedPorts {
			cursor := " "
			if i == m.Cursor {
				cursor = "❯"
			}

			// Format port info
			portLine := fmt.Sprintf("%s %s", cursor, port.AppName)
			if i == m.Cursor {
				portLine = selectedStyle.Render(portLine)
			} else {
				portLine = normalStyle.Render(portLine)
			}

			// Port info with amber highlight for port number
			portInfo := labelStyle.Render("Port: ") + highlightStyle.Render(fmt.Sprintf("%d", port.Port)) + " • " + statusStyle.Render("🟢 ACTIVE")

			// Add security indicator with appropriate color
			if port.Security != nil && (port.Security.BasicAuth || port.Security.IPRestrictions) {
				portInfo += " • " + securityEnabledStyle.Render("🔒 Secured")
			} else {
				portInfo += " • " + securityDisabledStyle.Render("🔓 No Auth")
			}

			ngrokURL := mutedStyle.Render("(not tunneled)")
			if port.NgrokURL != nil {
				ngrokURL = urlStyle.Render(*port.NgrokURL)
			}

			b.WriteString(portLine + "\n")
			b.WriteString("    " + portInfo + "\n")
			b.WriteString("    " + ngrokURL + "\n")
			b.WriteString("\n")
		}
	}

	// Footer info
	b.WriteString("─────────────────────────────────────────────────────────────────\n")
	footer := mutedStyle.Render(fmt.Sprintf("💡 Last updated: %s", m.LastUpdated.Format("15:04:05")))
	b.WriteString(footer + "\n\n")

	// Keybindings
	keyHelp := "[↑/↓] Navigate • [Enter] Details"
	if m.GetTotalPages() > 1 {
		keyHelp += " • [←/→] Page"
	}
	keyHelp += " • [M] Menu • [R] Refresh • [Q] Quit"
	keybindings := mutedStyle.Render(keyHelp)
	b.WriteString(keybindings)

	// Add menu overlay if open
	if m.MenuOpen {
		return renderWithMenu(b.String(), m)
	}

	return borderStyle.Render(b.String())
}

func formatRelativeTime(t time.Time) string {
	duration := time.Since(t)

	if duration < time.Minute {
		return "just now"
	} else if duration < time.Hour {
		mins := int(duration.Minutes())
		return fmt.Sprintf("%dm ago", mins)
	} else if duration < 24*time.Hour {
		hours := int(duration.Hours())
		mins := int(duration.Minutes()) % 60
		return fmt.Sprintf("%dh %dm ago", hours, mins)
	} else {
		days := int(duration.Hours()) / 24
		return fmt.Sprintf("%dd ago", days)
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func renderWithMenu(content string, m *models.Model) string {
	// Menu overlay with cursor
	menuStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FFFF00")).
		Padding(1, 2).
		Background(lipgloss.Color("#1A1A1A"))

	menuItemStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FFFFFF"))

	menuSelectedStyle := lipgloss.NewStyle().
		Background(lipgloss.Color("#F4A261")). // Amber accent
		Foreground(lipgloss.Color("#1E293B")). // Dark slate
		Bold(true)

	menuItems := []struct {
		label       string
		isSeparator bool
	}{
		{"Register New Port", false}, // 0
		{"Release Selected", false},  // 1
		{"Security Status", false},   // 2
		{"View Logs", false},         // 3
		{"──────────────", true},     // 4
		{"Configuration", false},     // 5
		{"Export Registry", false},   // 6
		{"──────────────", true},     // 7
		{"About", false},             // 8
		{"Quit", false},              // 9
	}

	menu := headerStyle.Render("Admin Menu") + "\n\n"

	for i, item := range menuItems {
		if item.isSeparator {
			menu += "  " + mutedStyle.Render(item.label) + "\n"
		} else {
			cursor := "  "
			text := item.label

			if i == m.MenuCursor {
				cursor = "❯ "
				menu += cursor + menuSelectedStyle.Render(text) + "\n"
			} else {
				menu += cursor + menuItemStyle.Render(text) + "\n"
			}
		}
	}

	menuBox := menuStyle.Render(menu)

	// Overlay menu on content
	return lipgloss.JoinHorizontal(lipgloss.Left, content, menuBox)
}

package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#7D56F4")).
			Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#7D56F4")).
			Foreground(lipgloss.Color("#FFFFFF")).
			Padding(0, 1)

	normalStyle = lipgloss.NewStyle().
			Padding(0, 1)

	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#00FFFF"))

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#00FF00"))

	mutedStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#666666"))

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#7D56F4")).
			Padding(1, 2)
)

// RenderListView renders the main port list view
func RenderListView(m *models.Model) string {
	var b strings.Builder

	// Title
	title := titleStyle.Render("🚂 Yardmaster TUI")
	b.WriteString(title + "\n\n")

	// Header
	header := headerStyle.Render(fmt.Sprintf("📊 Active Port Registrations (%d)", len(m.Ports)))
	b.WriteString(header + "\n\n")

	// Port list
	if len(m.Ports) == 0 {
		b.WriteString(mutedStyle.Render("  No active ports registered"))
		b.WriteString("\n")
	} else {
		for i, port := range m.Ports {
			cursor := " "
			if i == m.Cursor {
				cursor = "❯"
			}

			// Security indicator
			securityIcon := "🔓"
			securityText := "No Auth"

			// Domain type
			domainIcon := "🎲"
			domainType := "Random Domain"
			if port.NgrokURL != nil && strings.Contains(*port.NgrokURL, "locomotive.ngrok.dev") {
				domainIcon = "🌐"
				domainType = "Custom Domain"
			}

			// Relative time
			relTime := formatRelativeTime(port.RegisteredAt)

			// Format port info
			portLine := fmt.Sprintf("%s %s", cursor, port.AppName)
			if i == m.Cursor {
				portLine = selectedStyle.Render(portLine)
			} else {
				portLine = normalStyle.Render(portLine)
			}

			portInfo := fmt.Sprintf("Port: %d [ACTIVE]", port.Port)
			ngrokURL := "(not tunneled)"
			if port.NgrokURL != nil {
				ngrokURL = *port.NgrokURL
			}

			b.WriteString(portLine + strings.Repeat(" ", max(0, 50-len(port.AppName))) + statusStyle.Render(portInfo) + "\n")
			b.WriteString(fmt.Sprintf("   └─ %s\n", ngrokURL))
			b.WriteString(fmt.Sprintf("   └─ %s %s • %s %s\n", securityIcon, securityText, domainIcon, domainType))
			b.WriteString(fmt.Sprintf("   └─ %s\n", mutedStyle.Render("Registered: "+relTime)))
			b.WriteString("\n")
		}
	}

	// Footer info
	b.WriteString("─────────────────────────────────────────────────────────────────\n")
	footer := mutedStyle.Render(fmt.Sprintf("💡 Last updated: %s", m.LastUpdated.Format("15:04:05")))
	b.WriteString(footer + "\n\n")

	// Keybindings
	keybindings := mutedStyle.Render("[↑/↓] Navigate • [Enter] Details • [M] Menu • [R] Refresh • [Q] Quit")
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
	// Simple menu overlay for now
	menuStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FFFF00")).
		Padding(1, 2).
		Background(lipgloss.Color("#1A1A1A"))

	menuItems := []string{
		"❯ Register New Port",
		"  Release Selected",
		"  Edit Security",
		"  View Logs",
		"  ──────────────",
		"  Configuration",
		"  Export Registry",
		"  ──────────────",
		"  About",
		"  Quit",
	}

	menu := headerStyle.Render("🎛️  Admin Menu") + "\n\n"
	menu += strings.Join(menuItems, "\n")

	menuBox := menuStyle.Render(menu)

	// Overlay menu on content
	return lipgloss.JoinHorizontal(lipgloss.Left, content, menuBox)
}

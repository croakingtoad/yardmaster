package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderDetailView renders the port detail screen
func RenderDetailView(m *models.Model) string {
	port := m.GetSelectedPort()
	if port == nil {
		return borderStyle.Render("No port selected or port no longer exists\n\nPress [Esc] to return to list view")
	}
	var b strings.Builder

	// Title
	title := titleStyle.Render("🚂 Yardmaster TUI")
	b.WriteString(title + "\n\n")

	// Header
	header := headerStyle.Render(fmt.Sprintf("📍 Port Details: %s", port.AppName))
	b.WriteString(header + "\n\n")

	// Detail box
	detailStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#7D56F4")).
		Padding(1, 2).
		Width(70)

	details := ""

	// Basic info
	details += fmt.Sprintf("  App Name:          %s\n", port.AppName)
	details += fmt.Sprintf("  Port:              %d\n", port.Port)
	details += fmt.Sprintf("  Status:            %s\n", statusStyle.Render("🟢 ACTIVE"))
	if port.PID != nil {
		details += fmt.Sprintf("  Process ID:        %d\n", *port.PID)
	} else {
		details += "  Process ID:        (none)\n"
	}
	details += "\n"

	// Tunnel information
	details += headerStyle.Render("  ──────────────── Tunnel Information ────────────────") + "\n\n"
	if port.NgrokURL != nil {
		details += fmt.Sprintf("  Public URL:        %s\n", *port.NgrokURL)
		if strings.Contains(*port.NgrokURL, "locomotive.ngrok.dev") {
			details += "  Domain Type:       🌐 Custom Domain (Reserved)\n"
		} else {
			details += "  Domain Type:       🎲 Random ngrok URL\n"
		}
	} else {
		details += "  Public URL:        (not tunneled)\n"
		details += "  Domain Type:       None\n"
	}
	details += "  Region:            us\n"
	details += "\n"

	// Security
	details += headerStyle.Render("  ──────────────── Security ────────────────") + "\n\n"
	details += "  Authentication:    🔓 None\n"
	details += "  IP Restrictions:   None\n"
	details += "\n"

	// Metadata
	details += headerStyle.Render("  ──────────────── Metadata ────────────────") + "\n\n"
	details += fmt.Sprintf("  Registered:        %s\n", port.RegisteredAt.Format("Jan 2, 2006 3:04:05 PM"))
	details += fmt.Sprintf("  Uptime:            %s\n", formatRelativeTime(port.RegisteredAt))
	details += "  Managed By:        yardmaster\n"

	b.WriteString(detailStyle.Render(details))
	b.WriteString("\n\n")

	// Keybindings
	keybindings := mutedStyle.Render("[Esc] Back • [E] Edit • [D] Delete • [C] Copy URL • [Q] Quit")
	b.WriteString(keybindings)

	return borderStyle.Render(b.String())
}

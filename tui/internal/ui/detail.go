package ui

import (
	"fmt"
	"os"
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

	// Header with amber accent
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#F4A261")). // Amber for detail header
		Render(fmt.Sprintf("📍 Port Details: %s", port.AppName))
	b.WriteString(header + "\n\n")

	// Detail box with Railway Blue border
	detailStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5B9BD5")). // Railway Blue
		Padding(1, 2).
		Width(70)

	details := ""

	// Basic info with color hierarchy
	details += labelStyle.Render("  App Name:          ") + valueStyle.Render(port.AppName) + "\n"
	details += labelStyle.Render("  Port:              ") + highlightStyle.Render(fmt.Sprintf("%d", port.Port)) + "\n"
	details += labelStyle.Render("  Status:            ") + statusStyle.Render("🟢 ACTIVE") + "\n"

	// Get process information with info blue for process details
	if procInfo, err := models.GetProcessOnPort(port.Port); err == nil {
		details += labelStyle.Render("  Process ID:        ") + valueStyle.Render(fmt.Sprintf("%d", procInfo.PID)) + "\n"
		details += labelStyle.Render("  Binary:            ") + processStyle.Render(procInfo.GetBinaryName()) + "\n"
		if procInfo.WorkDir != "" {
			// Shorten home directory to ~
			workDir := procInfo.WorkDir
			if home, err := os.UserHomeDir(); err == nil {
				workDir = strings.Replace(workDir, home, "~", 1)
			}
			details += labelStyle.Render("  Working Dir:       ") + pathStyle.Render(workDir) + "\n"
		}
	} else {
		// Fallback to registry PID if available
		if port.PID != nil {
			details += labelStyle.Render("  Process ID:        ") + valueStyle.Render(fmt.Sprintf("%d", *port.PID)) + "\n"
		} else {
			details += labelStyle.Render("  Process ID:        ") + mutedStyle.Render("(none)") + "\n"
		}
		details += labelStyle.Render("  Binary:            ") + mutedStyle.Render("(not detected)") + "\n"
	}
	details += "\n"

	// Tunnel information with URL highlighting
	details += headerStyle.Render("  ──────────────── Tunnel Information ────────────────") + "\n\n"
	if port.NgrokURL != nil {
		details += labelStyle.Render("  Public URL:        ") + urlStyle.Render(*port.NgrokURL) + "\n"
		if strings.Contains(*port.NgrokURL, "locomotive.ngrok.dev") {
			details += labelStyle.Render("  Domain Type:       ") + securityEnabledStyle.Render("🌐 Custom Domain (Reserved)") + "\n"
		} else {
			details += labelStyle.Render("  Domain Type:       ") + valueStyle.Render("🎲 Random ngrok URL") + "\n"
		}
	} else {
		details += labelStyle.Render("  Public URL:        ") + mutedStyle.Render("(not tunneled)") + "\n"
		details += labelStyle.Render("  Domain Type:       ") + mutedStyle.Render("None") + "\n"
	}
	details += labelStyle.Render("  Region:            ") + valueStyle.Render("us") + "\n"
	details += "\n"

	// Security with color coding
	details += headerStyle.Render("  ──────────────── Security ────────────────") + "\n\n"
	if port.Security != nil {
		if port.Security.BasicAuth {
			details += labelStyle.Render("  Authentication:    ") + securityEnabledStyle.Render("🔒 Basic Auth Enabled") + "\n"
		} else {
			details += labelStyle.Render("  Authentication:    ") + securityDisabledStyle.Render("🔓 None") + "\n"
		}

		if port.Security.IPRestrictions {
			details += labelStyle.Render("  IP Restrictions:   ") + securityEnabledStyle.Render("🔒 Enabled") + "\n"
		} else {
			details += labelStyle.Render("  IP Restrictions:   ") + securityDisabledStyle.Render("None") + "\n"
		}
	} else {
		// Legacy registrations without security field
		details += labelStyle.Render("  Authentication:    ") + securityDisabledStyle.Render("🔓 None") + "\n"
		details += labelStyle.Render("  IP Restrictions:   ") + securityDisabledStyle.Render("None") + "\n"
	}
	details += "\n"

	// Metadata with info blue for time-based info
	details += headerStyle.Render("  ──────────────── Metadata ────────────────") + "\n\n"
	details += labelStyle.Render("  Registered:        ") + valueStyle.Render(port.RegisteredAt.Format("Jan 2, 2006 3:04:05 PM")) + "\n"
	details += labelStyle.Render("  Uptime:            ") + processStyle.Render(formatRelativeTime(port.RegisteredAt)) + "\n"
	details += labelStyle.Render("  Managed By:        ") + valueStyle.Render("yardmaster") + "\n"

	b.WriteString(detailStyle.Render(details))
	b.WriteString("\n\n")

	// Keybindings
	keybindings := mutedStyle.Render("[Esc] Back • [E] Edit • [D] Delete • [C] Copy URL • [Q] Quit")
	b.WriteString(keybindings)

	return borderStyle.Render(b.String())
}

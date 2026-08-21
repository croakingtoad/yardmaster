package ui

import (
	"fmt"
	"strings"

	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderEditSecurityView renders the security editor screen
func RenderEditSecurityView(m *models.Model) string {
	var b strings.Builder

	// Title
	title := titleStyle.Render(fmt.Sprintf("🔒 Edit Security: %s", m.SecurityEditAppName))
	b.WriteString(title + "\n\n")

	// Instructions
	instructions := mutedStyle.Render("Use ↑/↓ to navigate • Space/Enter to toggle • [S] Save • [Esc] Cancel")
	b.WriteString(instructions + "\n\n")

	// Security options
	options := []struct {
		name        string
		description string
		enabled     bool
		index       int
	}{
		{
			name:        "Basic Authentication",
			description: "Require username and password for access",
			enabled:     m.SecurityEditBasicAuth,
			index:       0,
		},
		{
			name:        "IP Restrictions",
			description: "Limit access to specific IP addresses",
			enabled:     m.SecurityEditIPRestrict,
			index:       1,
		},
		{
			name:        "Custom Domain",
			description: "Use custom domain for ngrok tunnel",
			enabled:     m.SecurityEditCustomDomain,
			index:       2,
		},
	}

	// Render each option
	for _, opt := range options {
		cursor := "  "
		if opt.index == m.SecurityEditCursor {
			cursor = "❯ "
		}

		// Status indicator
		statusIcon := "☐"
		if opt.enabled {
			statusIcon = "☑"
		}

		// Option line
		optionLine := fmt.Sprintf("%s%s %s", cursor, statusIcon, opt.name)
		if opt.index == m.SecurityEditCursor {
			optionLine = selectedStyle.Render(optionLine)
		} else {
			optionLine = normalStyle.Render(optionLine)
		}

		b.WriteString(optionLine + "\n")

		// Description (indented)
		descLine := "     " + mutedStyle.Render(opt.description)
		b.WriteString(descLine + "\n\n")
	}

	// Show error if any
	if m.Error != nil {
		b.WriteString("\n")
		errorMsg := errorStyle.Render(fmt.Sprintf("⚠️  Error: %s", m.Error.Error()))
		b.WriteString(errorMsg + "\n")
	}

	// Footer
	b.WriteString("\n")
	b.WriteString("─────────────────────────────────────────────────────────────────\n")
	footer := mutedStyle.Render("Changes will take effect immediately after saving")
	b.WriteString(footer + "\n")

	return borderStyle.Render(b.String())
}

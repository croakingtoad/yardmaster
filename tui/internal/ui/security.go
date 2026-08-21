package ui

import (
	"fmt"
	"strings"

	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderSecurityStatusView renders the recorded security status for a port.
func RenderSecurityStatusView(m *models.Model) string {
	var b strings.Builder

	title := titleStyle.Render(fmt.Sprintf("🔒 Security Status: %s", m.SecurityStatusAppName))
	b.WriteString(title + "\n\n")

	statuses := []struct {
		name    string
		enabled bool
	}{
		{
			name:    "Basic Authentication",
			enabled: m.SecurityStatus != nil && m.SecurityStatus.BasicAuth,
		},
		{
			name:    "IP Restrictions",
			enabled: m.SecurityStatus != nil && m.SecurityStatus.IPRestrictions,
		},
		{
			name:    "Custom Domain",
			enabled: m.SecurityStatus != nil && m.SecurityStatus.CustomDomain,
		},
	}

	for _, status := range statuses {
		value := "Not enabled"
		style := securityDisabledStyle
		if status.enabled {
			value = "Enabled"
			style = securityEnabledStyle
		}
		b.WriteString(style.Render(fmt.Sprintf("  %s: %s", status.name, value)) + "\n\n")
	}

	if m.Error != nil {
		b.WriteString("\n")
		errorMsg := errorStyle.Render(fmt.Sprintf("⚠️  Error: %s", m.Error.Error()))
		b.WriteString(errorMsg + "\n")
	}

	b.WriteString("\n")
	b.WriteString("─────────────────────────────────────────────────────────────────\n")
	b.WriteString(mutedStyle.Render("This read-only view reflects the ngrok configuration in effect when this port was registered.") + "\n")
	b.WriteString(mutedStyle.Render("To change them, edit ~/.yardmaster/config.json and register the port again.") + "\n")
	b.WriteString(mutedStyle.Render("[Esc] Back") + "\n")

	return borderStyle.Render(b.String())
}

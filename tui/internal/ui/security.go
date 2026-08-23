package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
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
	b.WriteString(mutedStyle.Render("To change global defaults, open Menu → Ngrok Security, then release and re-register this port.") + "\n")
	b.WriteString(mutedStyle.Render("[Esc] Back") + "\n")

	return borderStyle.Render(b.String())
}

// RenderSecurityConfigView renders the global ngrok security editor.
func RenderSecurityConfigView(m *models.Model) string {
	panelStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5B9BD5")).
		Padding(1, 2).
		Width(72)

	var b strings.Builder
	b.WriteString(headerStyle.Render("🔒 Global Ngrok Security"))
	b.WriteString("\n\n")

	state := m.SecurityConfig
	if state == nil {
		b.WriteString(errorStyle.Render("Security configuration is unavailable."))
		return "\n" + panelStyle.Render(b.String()) + "\n"
	}
	if state.Loading {
		b.WriteString(mutedStyle.Render("Loading settings from yardmaster config…"))
		return "\n" + panelStyle.Render(b.String()) + "\n"
	}

	renderSecurityInput(&b, "Custom domain", currentSecurityValue(state.DomainInput.Value()), state.DomainInput.View(), state.CurrentField == models.SecurityConfigFieldDomain)

	basicStatus := "Not set"
	if state.BasicAuthSet && !state.BasicAuthUnset {
		basicStatus = "Set"
	}
	if state.BasicAuthUnset {
		basicStatus = "Will be unset"
	}
	renderBasicAuthInput(&b, basicStatus, state.BasicAuthInput.View(), state.CurrentField == models.SecurityConfigFieldBasicAuth)
	b.WriteString(mutedStyle.Render("  Enter user:pass to replace it; Ctrl+U schedules removal.") + "\n\n")

	renderSecurityInput(&b, "IP allow", currentSecurityValue(state.IPAllowInput.Value()), state.IPAllowInput.View(), state.CurrentField == models.SecurityConfigFieldIPAllow)
	renderSecurityInput(&b, "IP deny", currentSecurityValue(state.IPDenyInput.Value()), state.IPDenyInput.View(), state.CurrentField == models.SecurityConfigFieldIPDeny)

	renderSecurityAction(&b, "Save Settings", state.CurrentField == models.SecurityConfigFieldSave)
	renderSecurityAction(&b, "Cancel", state.CurrentField == models.SecurityConfigFieldCancel)
	if state.Saving {
		b.WriteString("\n")
		b.WriteString(mutedStyle.Render("Saving through yardmaster config…"))
		b.WriteString("\n")
	}

	if state.ValidationError != "" {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render("❌ " + state.ValidationError))
		b.WriteString("\n")
	}

	b.WriteString("\n─────────────────────────────────────────────────────────────────\n")
	b.WriteString(mutedStyle.Render("These settings apply to tunnels created after this change. A running tunnel keeps the settings it started with.") + "\n")
	b.WriteString(mutedStyle.Render("To apply them to an existing port, release and re-register it — its public URL will change unless a custom domain is configured.") + "\n\n")
	b.WriteString(mutedStyle.Render("[Tab/↑/↓] Navigate • [Enter] Select/Save • [Ctrl+U] Unset basic auth • [Esc] Cancel"))

	return "\n" + panelStyle.Render(b.String()) + "\n"
}

func renderSecurityInput(b *strings.Builder, label, current, input string, selected bool) {
	prefix := "  "
	if selected {
		prefix = "❯ "
	}
	b.WriteString(prefix + valueStyle.Render(label) + " — Current: " + current + "\n")
	b.WriteString("  " + input + "\n\n")
}

func renderBasicAuthInput(b *strings.Builder, status, input string, selected bool) {
	prefix := "  "
	if selected {
		prefix = "❯ "
	}
	b.WriteString(prefix + valueStyle.Render("Basic auth") + ": " + status + "\n")
	b.WriteString("  " + input + "\n\n")
}

func renderSecurityAction(b *strings.Builder, label string, selected bool) {
	prefix := "  "
	if selected {
		prefix = "❯ "
	}
	b.WriteString(prefix + "[" + label + "]\n")
}

func currentSecurityValue(value string) string {
	if value == "" {
		return "Not configured"
	}
	return value
}

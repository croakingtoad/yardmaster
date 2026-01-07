package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderSettingsView renders the settings configuration screen
func RenderSettingsView(m *models.Model) string {
	// Create a bordered style for the settings panel
	settingsStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5B9BD5")). // Railway Blue
		Padding(1, 2).
		Width(60)

	var content strings.Builder

	// Header
	content.WriteString(headerStyle.Render("⚙️  Settings"))
	content.WriteString("\n\n")

	if m.Config == nil {
		content.WriteString("Error: Configuration not loaded\n")
		return "\n" + settingsStyle.Render(content.String()) + "\n"
	}

	// Settings display
	content.WriteString("Current Settings:\n\n")

	// Page Size
	cursor := ""
	if m.SettingsCursor == 0 {
		cursor = "> "
	} else {
		cursor = "  "
	}
	content.WriteString(fmt.Sprintf("%sPage Size: %d\n", cursor, m.Config.PageSize))

	// Theme
	if m.SettingsCursor == 1 {
		cursor = "> "
	} else {
		cursor = "  "
	}
	content.WriteString(fmt.Sprintf("%sTheme: %s\n", cursor, m.Config.Theme))

	// Show Timestamps
	if m.SettingsCursor == 2 {
		cursor = "> "
	} else {
		cursor = "  "
	}
	timestampStr := "Off"
	if m.Config.ShowTimestamps {
		timestampStr = "On"
	}
	content.WriteString(fmt.Sprintf("%sShow Timestamps: %s\n", cursor, timestampStr))

	// Refresh Fallback
	if m.SettingsCursor == 3 {
		cursor = "> "
	} else {
		cursor = "  "
	}
	refreshStr := "Disabled"
	if m.Config.RefreshFallback > 0 {
		refreshStr = fmt.Sprintf("%d seconds", m.Config.RefreshFallback)
	}
	content.WriteString(fmt.Sprintf("%sRefresh Fallback: %s\n", cursor, refreshStr))

	// Save option
	content.WriteString("\n")
	if m.SettingsCursor == 4 {
		cursor = "> "
	} else {
		cursor = "  "
	}
	content.WriteString(fmt.Sprintf("%s[Save Settings]\n", cursor))

	// Instructions
	content.WriteString("\n\n")
	content.WriteString("Controls:\n")
	content.WriteString("  ↑/↓ or j/k   Navigate settings\n")
	content.WriteString("  ←/→ or h/l   Adjust value\n")
	content.WriteString("  Enter        Save and apply\n")
	content.WriteString("  Esc or q     Cancel (discard changes)\n")

	// Status/Error messages
	if m.Message != "" {
		content.WriteString("\n")
		content.WriteString(fmt.Sprintf("ℹ️  %s\n", m.Message))
	}
	if m.Error != nil {
		content.WriteString("\n")
		content.WriteString(fmt.Sprintf("❌ Error: %s\n", m.Error.Error()))
	}

	return "\n" + settingsStyle.Render(content.String()) + "\n"
}

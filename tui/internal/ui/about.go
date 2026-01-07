package ui

import (
	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderAboutView renders the about screen
func RenderAboutView(m *models.Model) string {
	aboutStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#5B9BD5")). // Railway Blue
		Padding(2, 4).
		Width(60)

	content := headerStyle.Render("Yardmaster TUI") + "\n\n"
	content += "Version: 1.0.0\n"
	content += "Built with: Go + Bubbletea\n\n"
	content += "Port registry and ngrok tunnel management\n"
	content += "for AI agents via MCP protocol.\n\n"
	content += "Features:\n"
	content += "  - Event-driven file watching\n"
	content += "  - Thread-safe file locking\n"
	content += "  - Pagination (20 ports/page)\n"
	content += "  - Security status display\n"
	content += "  - Vim-style navigation\n\n"
	content += "Repository:\n"
	content += "  github.com/croakingtoad/yardmaster\n\n"
	content += "License: MIT\n"
	content += "Built by LOCOMOTIVE\n\n"
	content += mutedStyle.Render("[Esc] Back • [Q] Quit")

	return "\n" + aboutStyle.Render(content) + "\n"
}

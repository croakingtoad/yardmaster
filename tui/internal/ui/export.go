package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/export"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderExportView renders the export dialog
func RenderExportView(m *models.Model) string {
	var b strings.Builder

	// Header
	b.WriteString(headerStyle.Render("Export Registry"))
	b.WriteString("\n\n")

	// Format selection
	formats := []string{"JSON", "CSV"}

	b.WriteString(lipgloss.NewStyle().Bold(true).Render("Select Export Format:"))
	b.WriteString("\n\n")

	for i, format := range formats {
		if i == m.ExportFormatIndex {
			b.WriteString(selectedStyle.Render(fmt.Sprintf("▸ %s", format)))
		} else {
			b.WriteString(fmt.Sprintf("  %s", format))
		}
		b.WriteString("\n")
	}

	b.WriteString("\n")

	// Filename input
	b.WriteString(lipgloss.NewStyle().Bold(true).Render("Export Filename:"))
	b.WriteString("\n\n")

	// Show current filename with cursor if editing
	if m.ExportFilenameEdit {
		// Show editable filename with cursor
		cursorPos := m.ExportFilenameCursor
		filename := m.ExportFilename

		if cursorPos > len(filename) {
			cursorPos = len(filename)
		}

		before := filename[:cursorPos]
		after := ""
		if cursorPos < len(filename) {
			after = filename[cursorPos:]
		}

		b.WriteString("  ")
		b.WriteString(before)
		b.WriteString(lipgloss.NewStyle().Reverse(true).Render(" "))
		b.WriteString(after)
		b.WriteString("\n")
	} else {
		// Show non-editable filename
		b.WriteString(fmt.Sprintf("  %s\n", m.ExportFilename))
	}

	b.WriteString("\n")

	// Help text
	b.WriteString(mutedStyle.Render("Navigation:"))
	b.WriteString("\n")
	b.WriteString(mutedStyle.Render("  ↑/↓   Select format"))
	b.WriteString("\n")
	b.WriteString(mutedStyle.Render("  f     Edit filename"))
	b.WriteString("\n")
	if m.ExportFilenameEdit {
		b.WriteString(mutedStyle.Render("  type  Edit filename"))
		b.WriteString("\n")
		b.WriteString(mutedStyle.Render("  esc   Stop editing"))
		b.WriteString("\n")
	}
	b.WriteString(mutedStyle.Render("  enter Export"))
	b.WriteString("\n")
	b.WriteString(mutedStyle.Render("  esc   Cancel"))
	b.WriteString("\n")

	// Status/Error messages
	if m.Error != nil {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render(fmt.Sprintf("Error: %v", m.Error)))
	}
	if m.Message != "" {
		b.WriteString("\n")
		successMsgStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("#00FFAA"))
		b.WriteString(successMsgStyle.Render(m.Message))
	}

	return b.String()
}

// GetExportFormat returns the currently selected export format
func GetExportFormat(formatIndex int) export.ExportFormat {
	formats := []export.ExportFormat{export.FormatJSON, export.FormatCSV}
	if formatIndex < 0 || formatIndex >= len(formats) {
		return export.FormatJSON
	}
	return formats[formatIndex]
}

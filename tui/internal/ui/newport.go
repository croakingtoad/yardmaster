package ui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

var (
	formTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("#F4A261")). // Amber accent for form title
			MarginBottom(1)

	formLabelStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#94A3B8")). // Secondary text
			MarginRight(1)

	inputBoxStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("#475569")). // Slate
			Padding(0, 1).
			Width(44)

	focusedInputBoxStyle = lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("#F4A261")). // Amber when focused
				Padding(0, 1).
				Width(44)

	buttonStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("#475569")). // Slate
			Foreground(lipgloss.Color("#E2E8F0")). // Soft white
			Padding(0, 2).
			MarginRight(2)

	focusedButtonStyle = lipgloss.NewStyle().
				Background(lipgloss.Color("#F4A261")). // Amber when focused
				Foreground(lipgloss.Color("#1E293B")). // Dark slate
				Padding(0, 2).
				MarginRight(2).
				Bold(true)

	formErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#F87171")). // Soft coral
			Bold(true).
			MarginTop(1)

	formHelpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#64748B")). // Muted
			MarginTop(2)
)

// RenderNewPortView renders the new port registration form
func RenderNewPortView(m *models.Model) string {
	if m.Form == nil {
		return borderStyle.Render("Error: Form not initialized\n\nPress [Esc] to go back")
	}

	var b strings.Builder

	// Title
	b.WriteString(formTitleStyle.Render("Register New Port"))
	b.WriteString("\n\n")

	// App Name Field
	b.WriteString(labelStyle.Render("App Name (required):"))
	b.WriteString("\n")
	if m.Form.CurrentField == models.FormFieldAppName {
		b.WriteString(focusedInputBoxStyle.Render(m.Form.AppNameInput.View()))
	} else {
		b.WriteString(inputBoxStyle.Render(m.Form.AppNameInput.View()))
	}
	b.WriteString("\n\n")

	// Port Field
	b.WriteString(labelStyle.Render("Port (optional - leave blank for auto-assign):"))
	b.WriteString("\n")
	if m.Form.CurrentField == models.FormFieldPort {
		b.WriteString(focusedInputBoxStyle.Render(m.Form.PortInput.View()))
	} else {
		b.WriteString(inputBoxStyle.Render(m.Form.PortInput.View()))
	}
	b.WriteString("\n\n")

	// Validation Error
	if m.Form.ValidationError != "" {
		b.WriteString(formErrorStyle.Render(fmt.Sprintf("✗ %s", m.Form.ValidationError)))
		b.WriteString("\n\n")
	}

	// Buttons
	submitButton := " Submit "
	cancelButton := " Cancel "

	if m.Form.CurrentField == models.FormFieldSubmit {
		b.WriteString(focusedButtonStyle.Render(submitButton))
	} else {
		b.WriteString(buttonStyle.Render(submitButton))
	}

	if m.Form.CurrentField == models.FormFieldCancel {
		b.WriteString(focusedButtonStyle.Render(cancelButton))
	} else {
		b.WriteString(buttonStyle.Render(cancelButton))
	}

	b.WriteString("\n")

	// Help text
	b.WriteString(formHelpStyle.Render(
		"[Tab] Next Field  [Shift+Tab] Previous Field  [Enter] Activate  [Esc] Cancel",
	))

	return borderStyle.Render(b.String())
}

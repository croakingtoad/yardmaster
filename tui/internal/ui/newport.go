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
			Foreground(lipgloss.Color("170")).
			MarginBottom(1)

	labelStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			MarginRight(1)

	inputBoxStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("240")).
			Padding(0, 1).
			Width(44)

	focusedInputBoxStyle = lipgloss.NewStyle().
				BorderStyle(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("170")).
				Padding(0, 1).
				Width(44)

	buttonStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("240")).
			Foreground(lipgloss.Color("15")).
			Padding(0, 2).
			MarginRight(2)

	focusedButtonStyle = lipgloss.NewStyle().
				Background(lipgloss.Color("170")).
				Foreground(lipgloss.Color("15")).
				Padding(0, 2).
				MarginRight(2).
				Bold(true)

	formErrorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")).
			Bold(true).
			MarginTop(1)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
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
	b.WriteString(helpStyle.Render(
		"[Tab] Next Field  [Shift+Tab] Previous Field  [Enter] Activate  [Esc] Cancel",
	))

	return borderStyle.Render(b.String())
}

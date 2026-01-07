package models

import (
	"fmt"
	"strconv"

	"github.com/charmbracelet/bubbles/textinput"
)

// FormField represents the current form field being edited
type FormField int

const (
	FormFieldAppName FormField = iota
	FormFieldPort
	FormFieldSubmit
	FormFieldCancel
)

// FormState holds the state of the new port registration form
type FormState struct {
	AppNameInput textinput.Model
	PortInput    textinput.Model
	CurrentField FormField
	ValidationError string
}

// NewFormState creates a new form state with initialized text inputs
func NewFormState() FormState {
	appNameInput := textinput.New()
	appNameInput.Placeholder = "e.g., my-api, web-app"
	appNameInput.Focus()
	appNameInput.CharLimit = 100
	appNameInput.Width = 40

	portInput := textinput.New()
	portInput.Placeholder = "1024-65535 (optional - auto-assign)"
	portInput.CharLimit = 5
	portInput.Width = 40

	return FormState{
		AppNameInput: appNameInput,
		PortInput:    portInput,
		CurrentField: FormFieldAppName,
	}
}

// NextField moves to the next form field
func (f *FormState) NextField() {
	switch f.CurrentField {
	case FormFieldAppName:
		f.CurrentField = FormFieldPort
		f.AppNameInput.Blur()
		f.PortInput.Focus()
	case FormFieldPort:
		f.CurrentField = FormFieldSubmit
		f.PortInput.Blur()
	case FormFieldSubmit:
		f.CurrentField = FormFieldCancel
	case FormFieldCancel:
		f.CurrentField = FormFieldAppName
		f.AppNameInput.Focus()
	}
}

// PrevField moves to the previous form field
func (f *FormState) PrevField() {
	switch f.CurrentField {
	case FormFieldAppName:
		f.CurrentField = FormFieldCancel
		f.AppNameInput.Blur()
	case FormFieldPort:
		f.CurrentField = FormFieldAppName
		f.PortInput.Blur()
		f.AppNameInput.Focus()
	case FormFieldSubmit:
		f.CurrentField = FormFieldPort
		f.PortInput.Focus()
	case FormFieldCancel:
		f.CurrentField = FormFieldSubmit
	}
}

// Validate checks if the form data is valid
func (f *FormState) Validate() error {
	// App name is required
	appName := f.AppNameInput.Value()
	if appName == "" {
		return fmt.Errorf("app name is required")
	}

	// Port is optional, but if specified must be valid
	portStr := f.PortInput.Value()
	if portStr != "" {
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return fmt.Errorf("port must be a number")
		}
		if port < 1024 || port > 65535 {
			return fmt.Errorf("port must be between 1024 and 65535")
		}
	}

	return nil
}

// GetAppName returns the app name value
func (f *FormState) GetAppName() string {
	return f.AppNameInput.Value()
}

// GetPort returns the port value (empty string if not specified)
func (f *FormState) GetPort() string {
	return f.PortInput.Value()
}

// Reset clears the form
func (f *FormState) Reset() {
	f.AppNameInput.SetValue("")
	f.PortInput.SetValue("")
	f.CurrentField = FormFieldAppName
	f.ValidationError = ""
	f.AppNameInput.Focus()
	f.PortInput.Blur()
}

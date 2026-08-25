package models

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
)

// SecurityConfigField identifies an editable field or action on the global
// ngrok security configuration screen.
type SecurityConfigField int

const (
	SecurityConfigFieldDomain SecurityConfigField = iota
	SecurityConfigFieldBasicAuth
	SecurityConfigFieldIPAllow
	SecurityConfigFieldIPDeny
	SecurityConfigFieldSave
	SecurityConfigFieldCancel
)

// SecurityConfigValues contains only display-safe values returned by
// `yardmaster config`. BasicAuthSet deliberately records presence, not value.
type SecurityConfigValues struct {
	Domain       string
	BasicAuthSet bool
	IPAllow      []string
	IPDeny       []string
}

// SecurityConfigState holds the editor state for global ngrok settings.
type SecurityConfigState struct {
	DomainInput     textinput.Model
	BasicAuthInput  textinput.Model
	IPAllowInput    textinput.Model
	IPDenyInput     textinput.Model
	CurrentField    SecurityConfigField
	BasicAuthSet    bool
	BasicAuthUnset  bool
	Loading         bool
	Saving          bool
	ValidationError string
}

// SecurityConfigSave is a short-lived snapshot passed to the save command.
// BasicAuth must never be copied into a result message or persisted config.
type SecurityConfigSave struct {
	Domain         string
	BasicAuth      string
	BasicAuthUnset bool
	IPAllow        string
	IPDeny         string
}

type yardmasterRunner func(stdin []byte, args ...string) (stdout []byte, stderr []byte, err error)

type securityConfigLoadResultMsg struct {
	values SecurityConfigValues
	err    error
}

type securityConfigSaveResultMsg struct {
	field        SecurityConfigField
	err          error
	basicAuthSet *bool
}

// NewSecurityConfigState initializes the four editor inputs. The basic auth
// input is always masked and never pre-populated from CLI output.
func NewSecurityConfigState() SecurityConfigState {
	domainInput := newSecurityTextInput("example.ngrok.app")
	domainInput.Focus()

	basicAuthInput := newSecurityTextInput("user:pass (leave blank to keep current)")
	basicAuthInput.EchoMode = textinput.EchoPassword
	basicAuthInput.EchoCharacter = '•'

	ipAllowInput := newSecurityTextInput("10.0.0.0/8, 192.0.2.0/24")
	ipDenyInput := newSecurityTextInput("203.0.113.0/24")

	return SecurityConfigState{
		DomainInput:    domainInput,
		BasicAuthInput: basicAuthInput,
		IPAllowInput:   ipAllowInput,
		IPDenyInput:    ipDenyInput,
		CurrentField:   SecurityConfigFieldDomain,
		Loading:        true,
	}
}

func newSecurityTextInput(placeholder string) textinput.Model {
	input := textinput.New()
	input.Placeholder = placeholder
	input.CharLimit = 500
	input.Width = 52
	return input
}

func (s *SecurityConfigState) apply(values SecurityConfigValues) {
	s.DomainInput.SetValue(values.Domain)
	s.BasicAuthInput.SetValue("")
	s.IPAllowInput.SetValue(strings.Join(values.IPAllow, ", "))
	s.IPDenyInput.SetValue(strings.Join(values.IPDeny, ", "))
	s.BasicAuthSet = values.BasicAuthSet
	s.BasicAuthUnset = false
	s.Loading = false
	s.ValidationError = ""
	s.focus(SecurityConfigFieldDomain)
}

func (s *SecurityConfigState) focus(field SecurityConfigField) {
	s.DomainInput.Blur()
	s.BasicAuthInput.Blur()
	s.IPAllowInput.Blur()
	s.IPDenyInput.Blur()
	s.CurrentField = field

	switch field {
	case SecurityConfigFieldDomain:
		s.DomainInput.Focus()
	case SecurityConfigFieldBasicAuth:
		s.BasicAuthInput.Focus()
	case SecurityConfigFieldIPAllow:
		s.IPAllowInput.Focus()
	case SecurityConfigFieldIPDeny:
		s.IPDenyInput.Focus()
	}
}

func (s *SecurityConfigState) move(delta int) {
	next := int(s.CurrentField) + delta
	if next < int(SecurityConfigFieldDomain) {
		next = int(SecurityConfigFieldCancel)
	}
	if next > int(SecurityConfigFieldCancel) {
		next = int(SecurityConfigFieldDomain)
	}
	s.focus(SecurityConfigField(next))
}

func defaultYardmasterRunner(stdin []byte, args ...string) ([]byte, []byte, error) {
	cmd := exec.Command("yardmaster", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdin = bytes.NewReader(stdin)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

func loadSecurityConfigCmd(runner yardmasterRunner) tea.Cmd {
	return func() tea.Msg {
		stdout, stderr, err := runner(nil, "config", "--json")
		if err != nil {
			return securityConfigLoadResultMsg{err: commandError(stdout, stderr, err)}
		}

		values, err := parseSecurityConfig(stdout)
		if err != nil && len(bytes.TrimSpace(stderr)) > 0 {
			err = fmt.Errorf("%w; yardmaster stderr: %s", err, strings.TrimSpace(string(stderr)))
		}
		return securityConfigLoadResultMsg{values: values, err: err}
	}
}

func parseSecurityConfig(data []byte) (SecurityConfigValues, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(data, &root); err != nil {
		return SecurityConfigValues{}, fmt.Errorf("parse yardmaster config: %w", err)
	}

	var ngrok map[string]json.RawMessage
	if raw, ok := root["ngrok"]; ok {
		if err := json.Unmarshal(raw, &ngrok); err != nil {
			return SecurityConfigValues{}, fmt.Errorf("parse yardmaster config ngrok settings: %w", err)
		}
	}

	var values SecurityConfigValues
	if raw, ok := ngrok["domain"]; ok {
		if err := json.Unmarshal(raw, &values.Domain); err != nil {
			return SecurityConfigValues{}, fmt.Errorf("parse ngrok.domain: %w", err)
		}
	}
	if raw, ok := ngrok["basic_auth"]; ok {
		shape := jsonValueShape(raw)
		if shape != "string" {
			return SecurityConfigValues{}, fmt.Errorf(
				"parse ngrok.basic_auth: unexpected %s sentinel shape",
				shape,
			)
		}

		var sentinel string
		if err := json.Unmarshal(raw, &sentinel); err != nil {
			return SecurityConfigValues{}, fmt.Errorf("parse ngrok.basic_auth sentinel: %w", err)
		}
		switch sentinel {
		case "(set)":
			values.BasicAuthSet = true
		case "(not set)":
			values.BasicAuthSet = false
		default:
			return SecurityConfigValues{}, fmt.Errorf(
				"parse ngrok.basic_auth: unexpected string sentinel shape",
			)
		}
	}
	if raw, ok := ngrok["ip_allow"]; ok {
		if err := json.Unmarshal(raw, &values.IPAllow); err != nil {
			return SecurityConfigValues{}, fmt.Errorf("parse ngrok.ip_allow: %w", err)
		}
	}
	if raw, ok := ngrok["ip_deny"]; ok {
		if err := json.Unmarshal(raw, &values.IPDeny); err != nil {
			return SecurityConfigValues{}, fmt.Errorf("parse ngrok.ip_deny: %w", err)
		}
	}

	return values, nil
}

func jsonValueShape(raw json.RawMessage) string {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return "empty"
	}
	switch trimmed[0] {
	case '"':
		return "string"
	case '{':
		return "object"
	case '[':
		return "array"
	case 'n':
		return "null"
	case 't', 'f':
		return "boolean"
	default:
		return "number"
	}
}

func saveSecurityConfigCmd(save SecurityConfigSave, runner yardmasterRunner) tea.Cmd {
	return func() tea.Msg {
		payload := map[string]any{
			"ngrok.domain":   stringOrNil(save.Domain),
			"ngrok.ip_allow": stringOrNil(save.IPAllow),
			"ngrok.ip_deny":  stringOrNil(save.IPDeny),
		}
		var basicAuthSet *bool
		if save.BasicAuth != "" {
			payload["ngrok.basic_auth"] = save.BasicAuth
			updated := true
			basicAuthSet = &updated
		} else if save.BasicAuthUnset {
			payload["ngrok.basic_auth"] = nil
			updated := false
			basicAuthSet = &updated
		}

		input, err := json.Marshal(payload)
		if err != nil {
			return securityConfigSaveResultMsg{err: fmt.Errorf("encode security config: %w", err)}
		}
		payload["ngrok.basic_auth"] = nil

		stdout, stderr, err := runner(input, "config", "apply", "--stdin")
		clear(input)
		save.BasicAuth = ""
		if err != nil {
			return securityConfigSaveResultMsg{
				field: fieldFromConfigApplyError(stderr),
				err:   commandError(stdout, stderr, err),
			}
		}

		return securityConfigSaveResultMsg{basicAuthSet: basicAuthSet}
	}
}

func stringOrNil(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func fieldFromConfigApplyError(stderr []byte) SecurityConfigField {
	message := string(stderr)
	switch {
	case strings.Contains(message, "ngrok.basic_auth"):
		return SecurityConfigFieldBasicAuth
	case strings.Contains(message, "ngrok.ip_allow"):
		return SecurityConfigFieldIPAllow
	case strings.Contains(message, "ngrok.ip_deny"):
		return SecurityConfigFieldIPDeny
	default:
		return SecurityConfigFieldDomain
	}
}

func commandError(stdout []byte, stderr []byte, err error) error {
	message := strings.TrimSpace(string(stderr))
	if message == "" {
		message = strings.TrimSpace(string(stdout))
	}
	if message != "" {
		return fmt.Errorf("%s", message)
	}
	return fmt.Errorf("yardmaster command failed: %w", err)
}

func (m *Model) handleSecurityConfigInput(msg tea.Msg) (tea.Model, tea.Cmd) {
	state := m.SecurityConfig
	if state == nil {
		return m, nil
	}

	switch msg := msg.(type) {
	case tea.KeyMsg:
		if state.Saving {
			return m, nil
		}
		if msg.String() == "esc" {
			state.BasicAuthInput.SetValue("")
			m.SecurityConfig = nil
			m.CurrentView = ViewList
			m.Message = ""
			return m, nil
		}
		if state.Loading {
			return m, nil
		}
		switch msg.String() {
		case "tab", "down":
			state.move(1)
			return m, nil
		case "shift+tab", "up":
			state.move(-1)
			return m, nil
		case "ctrl+u":
			if state.CurrentField == SecurityConfigFieldBasicAuth {
				state.BasicAuthInput.SetValue("")
				state.BasicAuthUnset = true
				state.ValidationError = ""
			}
			return m, nil
		case "enter":
			switch state.CurrentField {
			case SecurityConfigFieldSave:
				save := SecurityConfigSave{
					Domain:         state.DomainInput.Value(),
					BasicAuth:      state.BasicAuthInput.Value(),
					BasicAuthUnset: state.BasicAuthUnset,
					IPAllow:        state.IPAllowInput.Value(),
					IPDeny:         state.IPDenyInput.Value(),
				}
				state.ValidationError = ""
				state.Saving = true
				return m, saveSecurityConfigCmd(save, defaultYardmasterRunner)
			case SecurityConfigFieldCancel:
				state.BasicAuthInput.SetValue("")
				m.SecurityConfig = nil
				m.CurrentView = ViewList
				return m, nil
			default:
				state.move(1)
				return m, nil
			}
		}

		var cmd tea.Cmd
		switch state.CurrentField {
		case SecurityConfigFieldDomain:
			state.DomainInput, cmd = state.DomainInput.Update(msg)
		case SecurityConfigFieldBasicAuth:
			state.BasicAuthInput, cmd = state.BasicAuthInput.Update(msg)
			if state.BasicAuthInput.Value() != "" {
				state.BasicAuthUnset = false
			}
		case SecurityConfigFieldIPAllow:
			state.IPAllowInput, cmd = state.IPAllowInput.Update(msg)
		case SecurityConfigFieldIPDeny:
			state.IPDenyInput, cmd = state.IPDenyInput.Update(msg)
		}
		state.ValidationError = ""
		return m, cmd

	case securityConfigLoadResultMsg:
		state.Loading = false
		if msg.err != nil {
			state.ValidationError = msg.err.Error()
			return m, nil
		}
		state.apply(msg.values)
		return m, nil

	case securityConfigSaveResultMsg:
		state.Saving = false
		if msg.basicAuthSet != nil {
			// The CLI accepted the credential (or unset request), so the
			// editor no longer needs to retain its masked input.
			state.BasicAuthInput.SetValue("")
			state.BasicAuthSet = *msg.basicAuthSet
			state.BasicAuthUnset = false
		}
		if msg.err != nil {
			state.ValidationError = msg.err.Error()
			state.focus(msg.field)
			return m, nil
		}
		state.BasicAuthInput.SetValue("")
		m.SecurityConfig = nil
		m.CurrentView = ViewList
		m.Message = "Ngrok security settings saved"
		return m, nil
	}

	return m, nil
}

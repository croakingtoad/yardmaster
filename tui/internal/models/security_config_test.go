package models

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestParseSecurityConfig(t *testing.T) {
	tests := []struct {
		name string
		json string
		want SecurityConfigValues
	}{
		{
			name: "configured",
			json: `{"ngrok":{"domain":"example.ngrok.app","basic_auth":"(set)","ip_allow":["10.0.0.0/8","192.0.2.0/24"],"ip_deny":["203.0.113.0/24"]}}`,
			want: SecurityConfigValues{
				Domain:       "example.ngrok.app",
				BasicAuthSet: true,
				IPAllow:      []string{"10.0.0.0/8", "192.0.2.0/24"},
				IPDeny:       []string{"203.0.113.0/24"},
			},
		},
		{
			name: "absent values",
			json: `{"ngrok":{}}`,
			want: SecurityConfigValues{},
		},
		{
			name: "unexpected basic auth value fails closed",
			json: `{"ngrok":{"basic_auth":"unexpected"}}`,
			want: SecurityConfigValues{BasicAuthSet: true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseSecurityConfig([]byte(tt.json))
			if err != nil {
				t.Fatalf("parseSecurityConfig() error = %v", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("parseSecurityConfig() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestSaveSecurityConfigCmdSurfacesCLIError(t *testing.T) {
	var calls [][]string
	runner := func(args ...string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		if len(args) >= 3 && args[2] == "ngrok.ip_allow" {
			return []byte("Error: invalid CIDR: not-a-cidr\n"), errors.New("exit status 1")
		}
		return []byte("ok\n"), nil
	}

	msg := saveSecurityConfigCmd(SecurityConfigSave{
		Domain:    "example.ngrok.app",
		BasicAuth: "alice:correct-horse",
		IPAllow:   "not-a-cidr",
		IPDeny:    "203.0.113.0/24",
	}, runner)().(securityConfigSaveResultMsg)

	if msg.err == nil || msg.err.Error() != "Error: invalid CIDR: not-a-cidr" {
		t.Fatalf("save result error = %v", msg.err)
	}
	if msg.field != SecurityConfigFieldIPAllow {
		t.Errorf("save result field = %v, want IP allow", msg.field)
	}
	if strings.Contains(msg.err.Error(), "alice:correct-horse") {
		t.Fatal("save result leaked basic auth plaintext")
	}

	wantCalls := [][]string{
		{"config", "set", "ngrok.domain", "example.ngrok.app"},
		{"config", "set", "ngrok.basic_auth", "alice:correct-horse"},
		{"config", "set", "ngrok.ip_allow", "not-a-cidr"},
	}
	if !reflect.DeepEqual(calls, wantCalls) {
		t.Errorf("runner calls = %#v, want %#v", calls, wantCalls)
	}
}

func TestSaveSecurityConfigCmdSetsAndUnsetsThroughCLI(t *testing.T) {
	var calls [][]string
	runner := func(args ...string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		return []byte("ok\n"), nil
	}

	msg := saveSecurityConfigCmd(SecurityConfigSave{
		BasicAuthUnset: true,
		IPAllow:        "10.0.0.0/8,192.0.2.0/24",
	}, runner)().(securityConfigSaveResultMsg)
	if msg.err != nil {
		t.Fatalf("save result error = %v", msg.err)
	}

	wantCalls := [][]string{
		{"config", "unset", "ngrok.domain"},
		{"config", "unset", "ngrok.basic_auth"},
		{"config", "set", "ngrok.ip_allow", "10.0.0.0/8,192.0.2.0/24"},
		{"config", "unset", "ngrok.ip_deny"},
	}
	if !reflect.DeepEqual(calls, wantCalls) {
		t.Errorf("runner calls = %#v, want %#v", calls, wantCalls)
	}
	if msg.basicAuthSet == nil || *msg.basicAuthSet {
		t.Errorf("basic auth state = %v, want false", msg.basicAuthSet)
	}
}

func TestLoadSecurityConfigCmdUsesRedactedConfigCommand(t *testing.T) {
	var calls [][]string
	runner := func(args ...string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		return []byte(`{"ngrok":{"basic_auth":"(set)"}}`), nil
	}

	msg := loadSecurityConfigCmd(runner)().(securityConfigLoadResultMsg)
	if msg.err != nil {
		t.Fatalf("load result error = %v", msg.err)
	}
	if !msg.values.BasicAuthSet {
		t.Fatal("load result did not recognize redacted basic auth sentinel")
	}
	if !reflect.DeepEqual(calls, [][]string{{"config"}}) {
		t.Errorf("runner calls = %#v, want config command", calls)
	}
}

func TestSecurityConfigSaveClearsCredentialBeforeCommandRuns(t *testing.T) {
	state := NewSecurityConfigState()
	state.Loading = false
	state.CurrentField = SecurityConfigFieldSave
	state.BasicAuthInput.SetValue("alice:correct-horse")
	m := &Model{CurrentView: ViewSecurityConfig, SecurityConfig: &state}

	_, cmd := m.handleSecurityConfigInput(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("expected save command")
	}
	if got := m.SecurityConfig.BasicAuthInput.Value(); got != "" {
		t.Fatalf("basic auth retained in model after save started: %q", got)
	}
}

func TestSecurityConfigSaveFailureKeepsFieldEditable(t *testing.T) {
	state := NewSecurityConfigState()
	state.Loading = false
	state.Saving = true
	state.IPAllowInput.SetValue("not-a-cidr")
	m := &Model{CurrentView: ViewSecurityConfig, SecurityConfig: &state}

	_, cmd := m.handleSecurityConfigInput(securityConfigSaveResultMsg{
		field: SecurityConfigFieldIPAllow,
		err:   errors.New("Error: invalid CIDR: not-a-cidr"),
	})
	if cmd != nil {
		t.Fatal("save failure returned an unexpected command")
	}
	if state.CurrentField != SecurityConfigFieldIPAllow || !state.IPAllowInput.Focused() {
		t.Fatal("failed field was not left focused for correction")
	}
	if state.IPAllowInput.Value() != "not-a-cidr" {
		t.Fatal("failed field input was discarded")
	}
	if state.ValidationError != "Error: invalid CIDR: not-a-cidr" {
		t.Errorf("validation error = %q", state.ValidationError)
	}
}

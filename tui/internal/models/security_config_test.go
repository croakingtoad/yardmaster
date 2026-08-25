package models

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
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
			name: "not set sentinel",
			json: `{"ngrok":{"basic_auth":"(not set)"}}`,
			want: SecurityConfigValues{},
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

func TestParseSecurityConfigRejectsUnexpectedBasicAuthSentinels(t *testing.T) {
	tests := []struct {
		name  string
		value string
		shape string
	}{
		{name: "other string", value: `"plaintext-must-not-appear"`, shape: "string"},
		{name: "null", value: `null`, shape: "null"},
		{name: "number", value: `42`, shape: "number"},
		{name: "array", value: `[]`, shape: "array"},
		{name: "object", value: `{}`, shape: "object"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseSecurityConfig([]byte(`{"ngrok":{"basic_auth":` + tt.value + `}}`))
			if err == nil {
				t.Fatal("parseSecurityConfig() error = nil, want strict sentinel rejection")
			}
			if !strings.Contains(err.Error(), tt.shape) {
				t.Fatalf("parse error = %q, want shape %q", err, tt.shape)
			}
			if strings.Contains(err.Error(), "plaintext-must-not-appear") {
				t.Fatal("parse error leaked an unexpected basic auth value")
			}
		})
	}
}

func TestSaveSecurityConfigCmdIsAtomicAgainstRealCLI(t *testing.T) {
	home := t.TempDir()
	configDirectory := filepath.Join(home, ".yardmaster")
	configPath := filepath.Join(configDirectory, "config.json")
	if err := os.Mkdir(configDirectory, 0o700); err != nil {
		t.Fatalf("create config directory: %v", err)
	}
	original := []byte("{\"ngrok\":{\"domain\":\"keep.ngrok.app\",\"basic_auth\":\"keep:secret\"}}\n")
	if err := os.WriteFile(configPath, original, 0o600); err != nil {
		t.Fatalf("write initial config: %v", err)
	}
	originalHash := sha256.Sum256(original)
	const credential = "alice:must-not-persist"

	msg := saveSecurityConfigCmd(SecurityConfigSave{
		Domain:    "must-not-persist.ngrok.app",
		BasicAuth: credential,
		IPAllow:   "10.0.0.0/8",
		IPDeny:    "not-a-cidr",
	}, realCLIRunner(t, home))().(securityConfigSaveResultMsg)

	if msg.err == nil {
		t.Fatal("save result error = nil, want invalid final field rejection")
	}
	if msg.field != SecurityConfigFieldIPDeny {
		t.Errorf("save result field = %v, want IP deny", msg.field)
	}
	if strings.Contains(msg.err.Error(), credential) {
		t.Fatal("save result leaked basic auth plaintext")
	}
	got, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config after rejected save: %v", err)
	}
	if gotHash := sha256.Sum256(got); gotHash != originalHash {
		t.Fatalf("rejected save changed config bytes:\n got %q\nwant %q", got, original)
	}
}

func TestSaveSecurityConfigCmdKeepsCredentialOutOfArgv(t *testing.T) {
	binDirectory := t.TempDir()
	argvPath := filepath.Join(binDirectory, "argv")
	stdinPath := filepath.Join(binDirectory, "stdin")
	scriptPath := filepath.Join(binDirectory, "yardmaster")
	script := "#!/bin/sh\ntr '\\000' '\\n' </proc/$$/cmdline >\"$ARGV_CAPTURE\"\ncat >\"$STDIN_CAPTURE\"\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write temporary yardmaster executable: %v", err)
	}
	t.Setenv("PATH", binDirectory+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("ARGV_CAPTURE", argvPath)
	t.Setenv("STDIN_CAPTURE", stdinPath)
	const credential = "alice:argv-secret"

	msg := saveSecurityConfigCmd(SecurityConfigSave{
		Domain:    "example.ngrok.app",
		BasicAuth: credential,
		IPAllow:   "10.0.0.0/8",
	}, defaultYardmasterRunner)().(securityConfigSaveResultMsg)
	if msg.err != nil {
		t.Fatalf("save result error = %v", msg.err)
	}

	argv, err := os.ReadFile(argvPath)
	if err != nil {
		t.Fatalf("read captured argv: %v", err)
	}
	if bytes.Contains(argv, []byte(credential)) {
		t.Fatalf("credential crossed process argv: %q", argv)
	}
	argvFields := strings.Fields(string(argv))
	if len(argvFields) < 3 {
		t.Fatalf("yardmaster argv = %#v, want config apply --stdin suffix", argvFields)
	}
	if got := argvFields[len(argvFields)-3:]; !reflect.DeepEqual(got, []string{"config", "apply", "--stdin"}) {
		t.Fatalf("yardmaster argv suffix = %#v, want config apply --stdin", got)
	}
	stdin, err := os.ReadFile(stdinPath)
	if err != nil {
		t.Fatalf("read captured stdin: %v", err)
	}
	if !bytes.Contains(stdin, []byte(credential)) {
		t.Fatal("credential was not delivered through stdin")
	}
}

func TestSecurityConfigSentinelRoundTripFromRealCLI(t *testing.T) {
	tests := []struct {
		name         string
		config       string
		basicAuthSet bool
	}{
		{name: "configured", config: `{"ngrok":{"basic_auth":"alice:correct-horse"}}`, basicAuthSet: true},
		{name: "absent", config: `{"ngrok":{}}`},
		{name: "empty string", config: `{"ngrok":{"basic_auth":""}}`},
		{name: "null", config: `{"ngrok":{"basic_auth":null}}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			home := t.TempDir()
			configDirectory := filepath.Join(home, ".yardmaster")
			if err := os.Mkdir(configDirectory, 0o700); err != nil {
				t.Fatalf("create config directory: %v", err)
			}
			if err := os.WriteFile(filepath.Join(configDirectory, "config.json"), []byte(tt.config), 0o600); err != nil {
				t.Fatalf("write config: %v", err)
			}

			msg := loadSecurityConfigCmd(realCLIRunner(t, home))().(securityConfigLoadResultMsg)
			if msg.err != nil {
				t.Fatalf("load result error = %v", msg.err)
			}
			if msg.values.BasicAuthSet != tt.basicAuthSet {
				t.Errorf("BasicAuthSet = %v, want %v", msg.values.BasicAuthSet, tt.basicAuthSet)
			}
		})
	}

	t.Run("unexpected string", func(t *testing.T) {
		_, err := parseSecurityConfig([]byte(`{"ngrok":{"basic_auth":"unexpected"}}`))
		if err == nil || !strings.Contains(err.Error(), "string") {
			t.Fatalf("parse error = %v, want unexpected string shape", err)
		}
	})
}

func TestLoadSecurityConfigCmdSurfacesMalformedRealConfig(t *testing.T) {
	for _, tt := range []struct {
		name    string
		content string
	}{
		{name: "empty", content: ""},
		{name: "partial JSON", content: `{"ngrok":`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			home := t.TempDir()
			configDirectory := filepath.Join(home, ".yardmaster")
			if err := os.Mkdir(configDirectory, 0o700); err != nil {
				t.Fatalf("create config directory: %v", err)
			}
			if err := os.WriteFile(filepath.Join(configDirectory, "config.json"), []byte(tt.content), 0o600); err != nil {
				t.Fatalf("write malformed config: %v", err)
			}

			msg := loadSecurityConfigCmd(realCLIRunner(t, home))().(securityConfigLoadResultMsg)
			if msg.err == nil {
				t.Fatal("load result error = nil, want malformed config failure")
			}
			if !strings.Contains(msg.err.Error(), "Error:") {
				t.Fatalf("load error = %q, want CLI parse failure", msg.err)
			}
			if !reflect.DeepEqual(msg.values, SecurityConfigValues{}) {
				t.Fatalf("malformed config loaded defaults: %#v", msg.values)
			}
		})
	}
}

func realCLIRunner(t *testing.T, home string) yardmasterRunner {
	t.Helper()
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("find node executable: %v", err)
	}
	cliPath, err := filepath.Abs("../../../dist/cli.js")
	if err != nil {
		t.Fatalf("resolve compiled CLI: %v", err)
	}
	if _, err := os.Stat(cliPath); err != nil {
		t.Fatalf("compiled CLI unavailable (run npm run build first): %v", err)
	}

	environment := make([]string, 0, len(os.Environ())+1)
	for _, entry := range os.Environ() {
		name := strings.SplitN(entry, "=", 2)[0]
		if name == "HOME" || strings.HasPrefix(name, "NGROK_") {
			continue
		}
		environment = append(environment, entry)
	}
	environment = append(environment, "HOME="+home)

	return func(stdin []byte, args ...string) ([]byte, []byte, error) {
		commandArgs := append([]string{cliPath}, args...)
		cmd := exec.Command(nodePath, commandArgs...)
		cmd.Env = environment
		cmd.Stdin = bytes.NewReader(stdin)
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		runErr := cmd.Run()
		return stdout.Bytes(), stderr.Bytes(), runErr
	}
}

func TestLoadSecurityConfigCmdUsesRedactedConfigCommand(t *testing.T) {
	fixture, err := os.ReadFile("testdata/yardmaster-config-json.stdout")
	if err != nil {
		t.Fatalf("read shared CLI contract fixture: %v", err)
	}

	var calls [][]string
	runner := func(stdin []byte, args ...string) ([]byte, []byte, error) {
		if len(stdin) != 0 {
			t.Fatalf("load command received stdin: %q", stdin)
		}
		calls = append(calls, append([]string(nil), args...))
		return fixture, nil, nil
	}

	msg := loadSecurityConfigCmd(runner)().(securityConfigLoadResultMsg)
	if msg.err != nil {
		t.Fatalf("load result error = %v", msg.err)
	}
	if !msg.values.BasicAuthSet {
		t.Fatal("load result did not recognize redacted basic auth sentinel")
	}
	if msg.values.Domain != "fixture.ngrok.app" {
		t.Errorf("loaded domain = %q, want fixture.ngrok.app", msg.values.Domain)
	}
	if !reflect.DeepEqual(calls, [][]string{{"config", "--json"}}) {
		t.Errorf("runner calls = %#v, want config --json command", calls)
	}
}

func TestDefaultYardmasterRunnerSeparatesWarningFromSuccessfulStdout(t *testing.T) {
	fixturePath, err := filepath.Abs("testdata/yardmaster-config-json.stdout")
	if err != nil {
		t.Fatalf("resolve CLI contract fixture: %v", err)
	}

	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "yardmaster")
	script := "#!/bin/sh\nprintf 'Warning: skipped invalid CIDR\\n' >&2\ncat \"$YARDMASTER_JSON_FIXTURE\"\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write temporary yardmaster executable: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("YARDMASTER_JSON_FIXTURE", fixturePath)

	stdout, stderr, err := defaultYardmasterRunner(nil, "config", "--json")
	if err != nil {
		t.Fatalf("defaultYardmasterRunner() error = %v", err)
	}
	if bytes.Contains(stdout, []byte("Warning:")) {
		t.Fatalf("successful runner stdout contains stderr warning: %q", stdout)
	}
	if !bytes.Contains(stderr, []byte("Warning:")) {
		t.Fatalf("successful runner stderr = %q, want warning", stderr)
	}

	values, err := parseSecurityConfig(stdout)
	if err != nil {
		t.Fatalf("parse runner stdout: %v", err)
	}
	if values.Domain != "fixture.ngrok.app" {
		t.Errorf("loaded domain = %q, want fixture.ngrok.app", values.Domain)
	}
}

func TestDefaultYardmasterRunnerReturnsStderrOnFailure(t *testing.T) {
	binDir := t.TempDir()
	scriptPath := filepath.Join(binDir, "yardmaster")
	script := "#!/bin/sh\nprintf 'Error: rejected setting\\n' >&2\nexit 1\n"
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write temporary yardmaster executable: %v", err)
	}
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	stdout, stderr, err := defaultYardmasterRunner(nil, "config", "set", "ngrok.ip_allow", "bad")
	if err == nil {
		t.Fatal("defaultYardmasterRunner() error = nil, want subprocess failure")
	}
	if len(stdout) != 0 {
		t.Fatalf("failure stdout = %q, want empty", stdout)
	}
	if got := strings.TrimSpace(string(stderr)); got != "Error: rejected setting" {
		t.Fatalf("failure stderr = %q, want error message", got)
	}
}

func TestLoadSecurityConfigCmdIncludesStderrWhenStdoutCannotBeParsed(t *testing.T) {
	runner := func(_ []byte, _ ...string) ([]byte, []byte, error) {
		return []byte("{"), []byte("diagnostic warning"), nil
	}

	msg := loadSecurityConfigCmd(runner)().(securityConfigLoadResultMsg)
	if msg.err == nil {
		t.Fatal("load result error = nil, want malformed stdout failure")
	}
	if !strings.Contains(msg.err.Error(), "diagnostic warning") {
		t.Fatalf("load error = %q, want captured stderr", msg.err)
	}
}

func TestSecurityConfigSaveRetainsCredentialUntilCommandSucceeds(t *testing.T) {
	const credential = "alice:missing-password"
	state := NewSecurityConfigState()
	state.Loading = false
	state.CurrentField = SecurityConfigFieldSave
	state.BasicAuthInput.SetValue(credential)
	m := &Model{CurrentView: ViewSecurityConfig, SecurityConfig: &state}

	_, cmd := m.handleSecurityConfigInput(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("expected save command")
	}
	if got := m.SecurityConfig.BasicAuthInput.Value(); got != credential {
		t.Fatalf("basic auth input after save started = %q, want retained credential", got)
	}

	_, cmd = m.handleSecurityConfigInput(securityConfigSaveResultMsg{
		field: SecurityConfigFieldBasicAuth,
		err:   errors.New("Error: Basic auth must be in format username:password"),
	})
	if cmd != nil {
		t.Fatal("basic auth rejection returned an unexpected command")
	}
	if got := state.BasicAuthInput.Value(); got != credential {
		t.Fatalf("basic auth input after rejection = %q, want retained credential", got)
	}
	if state.CurrentField != SecurityConfigFieldBasicAuth || !state.BasicAuthInput.Focused() {
		t.Fatal("rejected basic auth field was not left focused for correction")
	}
}

func TestSecurityConfigAtomicSaveFailureRetainsCredential(t *testing.T) {
	state := NewSecurityConfigState()
	state.Loading = false
	state.Saving = true
	const credential = "alice:correct-horse"
	state.BasicAuthInput.SetValue(credential)
	m := &Model{CurrentView: ViewSecurityConfig, SecurityConfig: &state}

	_, cmd := m.handleSecurityConfigInput(securityConfigSaveResultMsg{
		field: SecurityConfigFieldIPAllow,
		err:   errors.New("Error: invalid CIDR: not-a-cidr"),
	})
	if cmd != nil {
		t.Fatal("save failure returned an unexpected command")
	}
	if got := state.BasicAuthInput.Value(); got != credential {
		t.Fatalf("atomic save failure basic auth = %q, want retained credential", got)
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

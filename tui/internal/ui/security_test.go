package ui

import (
	"strings"
	"testing"

	"github.com/croakingtoad/yardmaster/tui/internal/models"
	"github.com/croakingtoad/yardmaster/tui/internal/registry"
)

func TestRenderSecurityStatusView(t *testing.T) {
	tests := []struct {
		name     string
		security *registry.SecurityInfo
		want     []string
	}{
		{
			name: "recorded values",
			security: &registry.SecurityInfo{
				BasicAuth:      true,
				IPRestrictions: false,
				CustomDomain:   true,
			},
			want: []string{
				"Basic Authentication: Enabled",
				"IP Restrictions: Not enabled",
				"Custom Domain: Enabled",
			},
		},
		{
			name:     "registration without security snapshot",
			security: nil,
			want: []string{
				"Basic Authentication: Not enabled",
				"IP Restrictions: Not enabled",
				"Custom Domain: Not enabled",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			view := RenderSecurityStatusView(&models.Model{
				SecurityStatusAppName: "example-app",
				SecurityStatus:        tt.security,
			})

			for _, want := range append([]string{
				"Security Status: example-app",
				"read-only view",
				"ngrok configuration in effect when this port was registered",
				"Menu → Ngrok Security",
			}, tt.want...) {
				if !strings.Contains(view, want) {
					t.Errorf("rendered view does not contain %q:\n%s", want, view)
				}
			}

			for _, unwanted := range []string{"❯", "toggle", "Save", "take effect immediately"} {
				if strings.Contains(view, unwanted) {
					t.Errorf("rendered view contains editor affordance %q:\n%s", unwanted, view)
				}
			}
		})
	}
}

func TestRenderSecurityConfigView(t *testing.T) {
	tests := []struct {
		name         string
		basicAuthSet bool
		domain       string
		ipAllow      string
		ipDeny       string
		want         []string
	}{
		{
			name:         "configured values",
			basicAuthSet: true,
			domain:       "example.ngrok.app",
			ipAllow:      "10.0.0.0/8, 192.0.2.0/24",
			ipDeny:       "203.0.113.0/24",
			want: []string{
				"Current: example.ngrok.app",
				"Basic auth: Set",
				"Current: 10.0.0.0/8, 192.0.2.0/24",
				"Current: 203.0.113.0/24",
			},
		},
		{
			name: "empty values",
			want: []string{
				"Custom domain",
				"Basic auth: Not set",
				"IP allow",
				"IP deny",
				"Current: Not configured",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state := models.NewSecurityConfigState()
			state.Loading = false
			state.BasicAuthSet = tt.basicAuthSet
			state.DomainInput.SetValue(tt.domain)
			state.IPAllowInput.SetValue(tt.ipAllow)
			state.IPDenyInput.SetValue(tt.ipDeny)

			view := RenderSecurityConfigView(&models.Model{SecurityConfig: &state})
			for _, want := range append(tt.want,
				"settings apply to tunnels created after this change",
				"release and re-register it",
				"public URL will change unless a custom domain is configured",
			) {
				if !strings.Contains(view, want) {
					t.Errorf("rendered view does not contain %q:\n%s", want, view)
				}
			}
		})
	}
}

func TestRenderSecurityConfigViewMasksBasicAuth(t *testing.T) {
	const secret = "alice:correct-horse"
	state := models.NewSecurityConfigState()
	state.Loading = false
	state.BasicAuthInput.SetValue(secret)

	view := RenderSecurityConfigView(&models.Model{SecurityConfig: &state})
	if strings.Contains(view, secret) {
		t.Fatalf("rendered view leaked basic auth plaintext:\n%s", view)
	}
}

func TestRenderSecurityConfigViewShowsCLIError(t *testing.T) {
	state := models.NewSecurityConfigState()
	state.Loading = false
	state.ValidationError = "Error: invalid CIDR: not-a-cidr"

	view := RenderSecurityConfigView(&models.Model{SecurityConfig: &state})
	if !strings.Contains(view, state.ValidationError) {
		t.Fatalf("rendered view does not show CLI error:\n%s", view)
	}
}

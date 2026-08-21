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
				"~/.yardmaster/config.json",
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

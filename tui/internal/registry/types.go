package registry

import "time"

// SecurityInfo holds security configuration for a port registration
type SecurityInfo struct {
	BasicAuth      bool `json:"basic_auth"`
	IPRestrictions bool `json:"ip_restrictions"`
	CustomDomain   bool `json:"custom_domain"`
}

// PortRegistration represents a registered port in the yardmaster registry
type PortRegistration struct {
	AppName      string        `json:"app_name"`
	Port         int           `json:"port"`
	NgrokURL     *string       `json:"ngrok_url"`
	PID          *int          `json:"pid"`
	RegisteredAt time.Time     `json:"registered_at"`
	Status       string        `json:"status"`
	Security     *SecurityInfo `json:"security,omitempty"`
}

// RegistryData represents the entire yardmaster registry file structure
type RegistryData struct {
	Ports       map[string]PortRegistration `json:"ports"`
	Version     string                      `json:"version"`
	LastUpdated time.Time                   `json:"last_updated"`
}

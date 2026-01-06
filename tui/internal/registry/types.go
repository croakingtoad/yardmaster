package registry

import "time"

// PortRegistration represents a registered port in the yardmaster registry
type PortRegistration struct {
	AppName      string    `json:"app_name"`
	Port         int       `json:"port"`
	NgrokURL     *string   `json:"ngrok_url"`
	PID          *int      `json:"pid"`
	RegisteredAt time.Time `json:"registered_at"`
	Status       string    `json:"status"`
}

// RegistryData represents the entire yardmaster registry file structure
type RegistryData struct {
	Ports       map[string]PortRegistration `json:"ports"`
	Version     string                      `json:"version"`
	LastUpdated time.Time                   `json:"last_updated"`
}

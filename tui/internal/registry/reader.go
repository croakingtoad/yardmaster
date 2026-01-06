package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Reader handles reading the yardmaster registry
type Reader struct {
	registryPath string
}

// NewReader creates a new registry reader
func NewReader() (*Reader, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	registryPath := filepath.Join(home, ".yardmaster", "registry.json")
	return &Reader{
		registryPath: registryPath,
	}, nil
}

// Read reads and parses the registry file
func (r *Reader) Read() (*RegistryData, error) {
	data, err := os.ReadFile(r.registryPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty registry if file doesn't exist
			return &RegistryData{
				Ports:       make(map[string]PortRegistration),
				Version:     "1.0.0",
				LastUpdated: time.Now(),
			}, nil
		}
		return nil, fmt.Errorf("failed to read registry: %w", err)
	}

	var registry RegistryData
	if err := json.Unmarshal(data, &registry); err != nil {
		return nil, fmt.Errorf("failed to parse registry: %w", err)
	}

	return &registry, nil
}

// GetActivePorts returns all active port registrations
func (r *Reader) GetActivePorts() ([]PortRegistration, error) {
	registry, err := r.Read()
	if err != nil {
		return nil, err
	}

	var active []PortRegistration
	for _, port := range registry.Ports {
		if port.Status == "active" {
			active = append(active, port)
		}
	}

	return active, nil
}

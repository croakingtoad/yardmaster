package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Writer handles writing to the yardmaster registry
type Writer struct {
	registryPath string
}

// NewWriter creates a new registry writer
func NewWriter(registryPath string) *Writer {
	return &Writer{
		registryPath: registryPath,
	}
}

// Write writes the registry data while holding the cross-language registry lock.
func (w *Writer) Write(data *RegistryData) error {
	return withRegistryLock(w.registryPath, func() error {
		return w.writeLocked(data)
	})
}

// writeLocked writes registry data while the caller holds the registry lock.
func (w *Writer) writeLocked(data *RegistryData) error {
	// Update last modified time
	data.LastUpdated = time.Now()

	// Marshal to JSON with pretty printing
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal registry: %w", err)
	}

	// Open file for writing (create if doesn't exist)
	file, err := os.OpenFile(w.registryPath, os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		return fmt.Errorf("failed to open registry for writing: %w", err)
	}
	defer file.Close()

	// Truncate file before writing
	if err := file.Truncate(0); err != nil {
		return fmt.Errorf("failed to truncate file: %w", err)
	}

	// Seek to beginning
	if _, err := file.Seek(0, 0); err != nil {
		return fmt.Errorf("failed to seek: %w", err)
	}

	// Write data
	if _, err := file.Write(jsonData); err != nil {
		return fmt.Errorf("failed to write registry: %w", err)
	}

	// Ensure data is flushed to disk
	if err := file.Sync(); err != nil {
		return fmt.Errorf("failed to sync file: %w", err)
	}

	return nil
}

// UpdatePortSecurity updates security settings for a specific port
func (w *Writer) UpdatePortSecurity(portNum int, security *SecurityInfo) error {
	return withRegistryLock(w.registryPath, func() error {
		reader := &Reader{registryPath: w.registryPath}
		registry, err := reader.readLocked()
		if err != nil {
			return fmt.Errorf("failed to read registry: %w", err)
		}

		// Registry is keyed by port number as string.
		portKey := fmt.Sprintf("%d", portNum)
		port, exists := registry.Ports[portKey]
		if !exists {
			return fmt.Errorf("port %d not found in registry", portNum)
		}

		port.Security = security
		registry.Ports[portKey] = port

		return w.writeLocked(registry)
	})
}

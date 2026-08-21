package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"syscall"
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

// Write writes the registry data to file with exclusive locking
func (w *Writer) Write(data *RegistryData) error {
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

	// Acquire exclusive lock for writing (LOCK_EX)
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX); err != nil {
		return fmt.Errorf("failed to acquire write lock: %w", err)
	}
	defer syscall.Flock(int(file.Fd()), syscall.LOCK_UN)

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
	// Read current registry
	reader := &Reader{registryPath: w.registryPath}
	registry, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read registry: %w", err)
	}

	// Registry is keyed by port number as string
	portKey := fmt.Sprintf("%d", portNum)

	// Find and update port
	port, exists := registry.Ports[portKey]
	if !exists {
		return fmt.Errorf("port %d not found in registry", portNum)
	}

	// Update security info
	port.Security = security
	registry.Ports[portKey] = port

	// Write back
	return w.Write(registry)
}

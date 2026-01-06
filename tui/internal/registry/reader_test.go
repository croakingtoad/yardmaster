package registry

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReader_Read_EmptyRegistry(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")

	reader := &Reader{registryPath: registryPath}

	// Should return empty registry for non-existent file
	data, err := reader.Read()
	if err != nil {
		t.Fatalf("Expected no error for missing file, got: %v", err)
	}

	if data == nil {
		t.Fatal("Expected data, got nil")
	}

	if len(data.Ports) != 0 {
		t.Errorf("Expected 0 ports, got %d", len(data.Ports))
	}
}

func TestReader_Read_ValidRegistry(t *testing.T) {
	// Create temp directory and registry file
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")

	// Create test registry data
	testData := RegistryData{
		Ports: map[string]PortRegistration{
			"3000": {
				AppName:      "test-app",
				Port:         3000,
				NgrokURL:     strPtr("https://test.ngrok.app"),
				PID:          intPtr(12345),
				RegisteredAt: time.Now(),
				Status:       "active",
			},
		},
		Version:     "1.0.0",
		LastUpdated: time.Now(),
	}

	// Write test data
	data, _ := json.MarshalIndent(testData, "", "  ")
	if err := os.WriteFile(registryPath, data, 0644); err != nil {
		t.Fatalf("Failed to write test registry: %v", err)
	}

	reader := &Reader{registryPath: registryPath}
	result, err := reader.Read()

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if len(result.Ports) != 1 {
		t.Errorf("Expected 1 port, got %d", len(result.Ports))
	}

	port, exists := result.Ports["3000"]
	if !exists {
		t.Fatal("Expected port 3000 to exist")
	}

	if port.AppName != "test-app" {
		t.Errorf("Expected app_name 'test-app', got '%s'", port.AppName)
	}

	if port.Port != 3000 {
		t.Errorf("Expected port 3000, got %d", port.Port)
	}
}

func TestReader_Read_InvalidJSON(t *testing.T) {
	// Create temp directory and invalid JSON file
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")

	// Write invalid JSON
	if err := os.WriteFile(registryPath, []byte("not valid json{"), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	reader := &Reader{registryPath: registryPath}
	_, err := reader.Read()

	if err == nil {
		t.Fatal("Expected error for invalid JSON, got nil")
	}
}

func TestReader_GetActivePorts(t *testing.T) {
	// Create temp directory and registry file
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")

	// Create test registry with mixed statuses
	testData := RegistryData{
		Ports: map[string]PortRegistration{
			"3000": {
				AppName:      "active-app",
				Port:         3000,
				RegisteredAt: time.Now(),
				Status:       "active",
			},
			"3001": {
				AppName:      "released-app",
				Port:         3001,
				RegisteredAt: time.Now(),
				Status:       "released",
			},
			"3002": {
				AppName:      "another-active",
				Port:         3002,
				RegisteredAt: time.Now(),
				Status:       "active",
			},
		},
		Version:     "1.0.0",
		LastUpdated: time.Now(),
	}

	// Write test data
	data, _ := json.MarshalIndent(testData, "", "  ")
	if err := os.WriteFile(registryPath, data, 0644); err != nil {
		t.Fatalf("Failed to write test registry: %v", err)
	}

	reader := &Reader{registryPath: registryPath}
	activePorts, err := reader.GetActivePorts()

	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if len(activePorts) != 2 {
		t.Errorf("Expected 2 active ports, got %d", len(activePorts))
	}

	// Check that only active ports are returned
	for _, port := range activePorts {
		if port.Status != "active" {
			t.Errorf("Expected status 'active', got '%s'", port.Status)
		}
	}
}

// Helper functions
func strPtr(s string) *string {
	return &s
}

func intPtr(i int) *int {
	return &i
}

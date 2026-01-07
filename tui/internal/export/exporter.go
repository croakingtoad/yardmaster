package export

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/croakingtoad/yardmaster/tui/internal/registry"
)

// ExportFormat represents the format for exporting registry data
type ExportFormat string

const (
	FormatJSON ExportFormat = "json"
	FormatCSV  ExportFormat = "csv"
)

// Exporter handles exporting registry data to various formats
type Exporter struct {
	registry *registry.RegistryData
}

// NewExporter creates a new exporter with registry data
func NewExporter(reg *registry.RegistryData) *Exporter {
	return &Exporter{
		registry: reg,
	}
}

// Export exports the registry to the specified file in the given format
func (e *Exporter) Export(filename string, format ExportFormat) error {
	switch format {
	case FormatJSON:
		return e.exportJSON(filename)
	case FormatCSV:
		return e.exportCSV(filename)
	default:
		return fmt.Errorf("unsupported export format: %s", format)
	}
}

// exportJSON exports registry as pretty-printed JSON
func (e *Exporter) exportJSON(filename string) error {
	// Create file
	file, err := os.Create(filename)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	// Marshal with pretty printing
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(e.registry); err != nil {
		return fmt.Errorf("failed to write JSON: %w", err)
	}

	return nil
}

// exportCSV exports registry as CSV with specified columns
func (e *Exporter) exportCSV(filename string) error {
	// Create file
	file, err := os.Create(filename)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write header
	header := []string{
		"app_name",
		"port",
		"ngrok_url",
		"status",
		"registered_at",
		"basic_auth",
		"ip_restrictions",
		"custom_domain",
	}
	if err := writer.Write(header); err != nil {
		return fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, port := range e.registry.Ports {
		row := []string{
			port.AppName,
			strconv.Itoa(port.Port),
			stringOrEmpty(port.NgrokURL),
			port.Status,
			port.RegisteredAt.Format(time.RFC3339),
			boolToString(port.Security != nil && port.Security.BasicAuth),
			boolToString(port.Security != nil && port.Security.IPRestrictions),
			boolToString(port.Security != nil && port.Security.CustomDomain),
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	return nil
}

// GetDefaultFilename returns the default filename for export with current date
func GetDefaultFilename(format ExportFormat) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	timestamp := time.Now().Format("20060102")
	filename := fmt.Sprintf("yardmaster-export-%s.%s", timestamp, format)
	return filepath.Join(home, filename), nil
}

// Helper functions

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func boolToString(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

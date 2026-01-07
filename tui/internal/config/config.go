package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// TUIConfig represents TUI user preferences
type TUIConfig struct {
	PageSize        int    `json:"pageSize"`
	Theme           string `json:"theme"`
	ShowTimestamps  bool   `json:"showTimestamps"`
	RefreshFallback int    `json:"refreshFallback"` // Seconds, 0 = disabled
}

// GetDefaultConfig returns default configuration values
func GetDefaultConfig() *TUIConfig {
	return &TUIConfig{
		PageSize:        20,
		Theme:           "dark",
		ShowTimestamps:  true,
		RefreshFallback: 0,
	}
}

// GetConfigPath returns the path to the TUI config file
func GetConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".yardmaster", "tui-config.json"), nil
}

// LoadConfig loads TUI configuration from disk, or returns defaults if not found
func LoadConfig() (*TUIConfig, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return nil, err
	}

	// If config doesn't exist, return defaults
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return GetDefaultConfig(), nil
	}

	// Read config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	// Parse JSON
	config := &TUIConfig{}
	if err := json.Unmarshal(data, config); err != nil {
		return nil, err
	}

	return config, nil
}

// SaveConfig saves TUI configuration to disk
func SaveConfig(config *TUIConfig) error {
	configPath, err := GetConfigPath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// Marshal to JSON with indentation
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	// Write to file
	return os.WriteFile(configPath, data, 0644)
}

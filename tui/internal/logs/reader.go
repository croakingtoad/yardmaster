package logs

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LogEntry represents a single log entry from activity.log
type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Event     string                 `json:"event"`
	App       string                 `json:"app"`
	Port      int                    `json:"port"`
	URL       string                 `json:"url,omitempty"`
	Message   string                 `json:"message,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// EventType categorizes log events for rendering
type EventType string

const (
	EventRegister      EventType = "register"
	EventRelease       EventType = "release"
	EventTunnelCreated EventType = "tunnel_created"
	EventTunnelClosed  EventType = "tunnel_closed"
	EventError         EventType = "error"
	EventOther         EventType = "other"
)

// Reader handles reading log files
type Reader struct {
	logPath string
}

// NewReader creates a new log reader
func NewReader() (*Reader, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	logPath := filepath.Join(home, ".yardmaster", "logs", "activity.log")
	return &Reader{
		logPath: logPath,
	}, nil
}

// GetLogPath returns the path to the log file
func (r *Reader) GetLogPath() string {
	return r.logPath
}

// ReadAll reads all log entries from the file
func (r *Reader) ReadAll() ([]LogEntry, error) {
	file, err := os.Open(r.logPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty slice if log file doesn't exist yet
			return []LogEntry{}, nil
		}
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	var entries []LogEntry
	scanner := bufio.NewScanner(file)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var entry LogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// Skip malformed lines but continue reading
			fmt.Fprintf(os.Stderr, "Warning: Skipping malformed log line %d: %v\n", lineNum, err)
			continue
		}

		entries = append(entries, entry)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading log file: %w", err)
	}

	return entries, nil
}

// FilterLogs filters log entries by app name or port
func FilterLogs(entries []LogEntry, filterText string) []LogEntry {
	if filterText == "" {
		return entries
	}

	var filtered []LogEntry
	filterLower := strings.ToLower(filterText)

	for _, entry := range entries {
		// Match against app name, port, or event
		if strings.Contains(strings.ToLower(entry.App), filterLower) ||
			fmt.Sprintf("%d", entry.Port) == filterText ||
			strings.Contains(strings.ToLower(entry.Event), filterLower) {
			filtered = append(filtered, entry)
		}
	}

	return filtered
}

// GetEventType categorizes an event for rendering
func GetEventType(event string) EventType {
	switch strings.ToLower(event) {
	case "register", "registered":
		return EventRegister
	case "release", "released":
		return EventRelease
	case "tunnel_created", "tunnel_create", "ngrok_started":
		return EventTunnelCreated
	case "tunnel_closed", "tunnel_close", "ngrok_stopped":
		return EventTunnelClosed
	case "error":
		return EventError
	default:
		return EventOther
	}
}

// FormatTimestamp formats a log timestamp for display
func FormatTimestamp(timestamp string) string {
	t, err := time.Parse(time.RFC3339, timestamp)
	if err != nil {
		return timestamp
	}
	return t.Format("2006-01-02 15:04:05")
}

package models

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// ProcessInfo contains information about a process running on a port
type ProcessInfo struct {
	PID     int
	Binary  string
	CmdLine string
	WorkDir string
}

// GetProcessOnPort uses lsof to find what's listening on a port
func GetProcessOnPort(port int) (*ProcessInfo, error) {
	// Use lsof to find process listening on port
	cmd := exec.Command("lsof", "-ti", fmt.Sprintf(":%d", port))
	output, err := cmd.Output()
	if err != nil {
		// No process found or lsof failed
		return nil, fmt.Errorf("no process found on port %d", port)
	}

	pidStr := strings.TrimSpace(string(output))
	if pidStr == "" {
		return nil, fmt.Errorf("no process found on port %d", port)
	}

	// Parse PID (lsof -ti returns just the PID)
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return nil, fmt.Errorf("invalid PID: %s", pidStr)
	}

	info := &ProcessInfo{
		PID: pid,
	}

	// Get binary path from /proc/<pid>/exe
	exePath := fmt.Sprintf("/proc/%d/exe", pid)
	if target, err := os.Readlink(exePath); err == nil {
		info.Binary = target
	} else {
		// Fallback: try to get from ps
		psCmd := exec.Command("ps", "-p", pidStr, "-o", "comm=")
		if psOutput, err := psCmd.Output(); err == nil {
			info.Binary = strings.TrimSpace(string(psOutput))
		}
	}

	// Get command line from /proc/<pid>/cmdline
	cmdlinePath := fmt.Sprintf("/proc/%d/cmdline", pid)
	if cmdlineBytes, err := os.ReadFile(cmdlinePath); err == nil {
		// cmdline uses null bytes as separators
		cmdline := string(cmdlineBytes)
		cmdline = strings.ReplaceAll(cmdline, "\x00", " ")
		info.CmdLine = strings.TrimSpace(cmdline)
	}

	// Get working directory from /proc/<pid>/cwd
	cwdPath := fmt.Sprintf("/proc/%d/cwd", pid)
	if cwd, err := os.Readlink(cwdPath); err == nil {
		info.WorkDir = cwd
	}

	return info, nil
}

// GetBinaryName returns just the binary name without full path
func (p *ProcessInfo) GetBinaryName() string {
	if p.Binary == "" {
		return "unknown"
	}
	return filepath.Base(p.Binary)
}

// GetShortCmdLine returns a truncated command line for display
func (p *ProcessInfo) GetShortCmdLine(maxLen int) string {
	if p.CmdLine == "" {
		return p.GetBinaryName()
	}
	if len(p.CmdLine) <= maxLen {
		return p.CmdLine
	}
	return p.CmdLine[:maxLen] + "..."
}

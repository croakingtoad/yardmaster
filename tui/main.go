package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
	"github.com/croakingtoad/yardmaster/tui/internal/ui"
)

func main() {
	// Auto-relaunch with proper color support if needed
	// Check if we need truecolor support and haven't already relaunched
	if os.Getenv("COLORTERM") != "truecolor" && os.Getenv("YARDMASTER_COLOR_RELAUNCH") != "1" {
		// Get the current executable path
		exe, err := os.Executable()
		if err != nil {
			// If we can't get executable path, continue anyway
			fmt.Fprintf(os.Stderr, "Warning: Could not detect executable path for color relaunch: %v\n", err)
		} else {
			// Re-execute with proper environment
			cmd := exec.Command(exe, os.Args[1:]...)
			cmd.Env = append(os.Environ(),
				"COLORTERM=truecolor",
				"TERM=xterm-256color",
				"YARDMASTER_COLOR_RELAUNCH=1", // Prevent infinite loop
			)
			cmd.Stdin = os.Stdin
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr

			// Run and exit with the same code
			if err := cmd.Run(); err != nil {
				if exitErr, ok := err.(*exec.ExitError); ok {
					if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
						os.Exit(status.ExitStatus())
					}
				}
				os.Exit(1)
			}
			os.Exit(0)
		}
	}

	model, err := models.NewModel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing: %v\n", err)
		os.Exit(1)
	}

	// Ensure cleanup on exit
	defer func() {
		if err := model.Close(); err != nil {
			fmt.Fprintf(os.Stderr, "Error during cleanup: %v\n", err)
		}
	}()

	// Get registry path and set up file watching
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error getting home directory: %v\n", err)
		os.Exit(1)
	}
	registryPath := home + "/.yardmaster/registry.json"

	// Initial data load
	if err := model.RefreshData(); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading registry: %v\n", err)
		os.Exit(1)
	}

	// Start watching the registry file
	if err := model.WatchRegistry(registryPath); err != nil {
		// Warn but don't fail - we can still refresh manually
		fmt.Fprintf(os.Stderr, "Warning: Could not watch registry file: %v\n", err)
	}

	p := tea.NewProgram(
		&appModel{Model: model},
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}

// appModel wraps models.Model to add the View method
type appModel struct {
	*models.Model
}

// View implements tea.Model
func (a *appModel) View() string {
	if a.Width == 0 {
		return "Loading..."
	}

	switch a.CurrentView {
	case models.ViewDetail:
		return ui.RenderDetailView(a.Model)
	case models.ViewNewPort:
		return ui.RenderNewPortView(a.Model)
	case models.ViewAbout:
		return ui.RenderAboutView(a.Model)
	case models.ViewMenu:
		return ui.RenderMenuView(a.Model)
	case models.ViewExport:
		return ui.RenderExportView(a.Model)
	case models.ViewSettings:
		return ui.RenderSettingsView(a.Model)
	case models.ViewLogs:
		return ui.RenderLogsView(a.Model)
	case models.ViewSecurityStatus:
		return ui.RenderSecurityStatusView(a.Model)
	default:
		return ui.RenderListView(a.Model)
	}
}

// Update delegates to the embedded Model
func (a *appModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	updatedModel, cmd := a.Model.Update(msg)

	// Type assertion with safety check
	if m, ok := updatedModel.(*models.Model); ok {
		a.Model = m
	} else {
		// This should never happen, but guard against panic
		fmt.Fprintf(os.Stderr, "Error: unexpected model type in Update\n")
	}

	return a, cmd
}

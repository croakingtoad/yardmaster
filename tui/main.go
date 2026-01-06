package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/croakingtoad/yardmaster/tui/internal/models"
	"github.com/croakingtoad/yardmaster/tui/internal/ui"
)

func main() {
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
	case models.ViewMenu:
		return ui.RenderMenuView(a.Model)
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

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

	// Initial data load
	if err := model.RefreshData(); err != nil {
		fmt.Fprintf(os.Stderr, "Error loading registry: %v\n", err)
		os.Exit(1)
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
	a.Model = updatedModel.(*models.Model)
	return a, cmd
}

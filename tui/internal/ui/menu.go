package ui

import (
	"github.com/croakingtoad/yardmaster/tui/internal/models"
)

// RenderMenuView renders the admin menu
func RenderMenuView(m *models.Model) string {
	// Menu is currently rendered as overlay in list view
	return RenderListView(m)
}

package registry

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewRegistryLockReportsStatAndCleanupFailures(t *testing.T) {
	lockPath := filepath.Join(t.TempDir(), "registry.json.lock")
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		t.Fatalf("create acquired lock: %v", err)
	}

	statErr := errors.New("forced post-mkdir stat failure")
	cleanupErr := errors.New("forced acquired-lock cleanup failure")
	originalStat := statAcquiredRegistryLock
	originalRemove := removeAcquiredRegistryLock
	statAcquiredRegistryLock = func(path string) (os.FileInfo, error) {
		if path != lockPath {
			t.Fatalf("stat called with %q, want %q", path, lockPath)
		}
		return nil, statErr
	}
	removeAcquiredRegistryLock = func(path string) error {
		if path != lockPath {
			t.Fatalf("remove called with %q, want %q", path, lockPath)
		}
		return cleanupErr
	}
	t.Cleanup(func() {
		statAcquiredRegistryLock = originalStat
		removeAcquiredRegistryLock = originalRemove
	})

	_, err := newRegistryLock(lockPath)
	if err == nil {
		t.Fatal("expected lock acquisition to fail")
	}
	if !errors.Is(err, statErr) {
		t.Errorf("error does not wrap stat failure: %v", err)
	}
	if !errors.Is(err, cleanupErr) {
		t.Errorf("error does not wrap cleanup failure: %v", err)
	}
	if !strings.Contains(err.Error(), statErr.Error()) || !strings.Contains(err.Error(), cleanupErr.Error()) {
		t.Errorf("error does not name both failures: %v", err)
	}
}

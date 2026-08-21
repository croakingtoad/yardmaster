package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestWriterWriteRespectsForeignLock(t *testing.T) {
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")
	lockPath := registryPath + ".lock"
	initial := []byte(`{"ports":{},"version":"1.0.0"}`)
	if err := os.WriteFile(registryPath, initial, 0o644); err != nil {
		t.Fatalf("write initial registry: %v", err)
	}
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		t.Fatalf("create foreign lock: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- NewWriter(registryPath).Write(emptyRegistry())
	}()

	select {
	case err := <-done:
		t.Fatalf("write completed while foreign lock was held: %v", err)
	case <-time.After(50 * time.Millisecond):
	}

	got, err := os.ReadFile(registryPath)
	if err != nil {
		t.Fatalf("read registry while locked: %v", err)
	}
	if string(got) != string(initial) {
		t.Fatalf("registry changed while foreign lock was held: got %q", got)
	}

	if err := os.Remove(lockPath); err != nil {
		t.Fatalf("release foreign lock: %v", err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("write after foreign lock release: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("write did not complete after foreign lock was released")
	}
}

func TestWriterWriteReclaimsStaleLock(t *testing.T) {
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")
	lockPath := registryPath + ".lock"
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		t.Fatalf("create stale lock: %v", err)
	}
	staleTime := time.Now().Add(-11 * time.Second)
	if err := os.Chtimes(lockPath, staleTime, staleTime); err != nil {
		t.Fatalf("age stale lock: %v", err)
	}

	if err := NewWriter(registryPath).Write(emptyRegistry()); err != nil {
		t.Fatalf("write with stale lock: %v", err)
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatalf("stale lock was not reclaimed and released: %v", err)
	}
}

func TestWriterUpdatePortSecurityDoesNotLoseConcurrentUpdates(t *testing.T) {
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")
	const portCount = 32
	data := emptyRegistry()
	for i := 0; i < portCount; i++ {
		port := 3000 + i
		data.Ports[fmt.Sprintf("%d", port)] = PortRegistration{
			AppName:      fmt.Sprintf("app-%d", port),
			Port:         port,
			RegisteredAt: time.Now(),
			Status:       "active",
		}
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal initial registry: %v", err)
	}
	if err := os.WriteFile(registryPath, encoded, 0o644); err != nil {
		t.Fatalf("write initial registry: %v", err)
	}

	writer := NewWriter(registryPath)
	start := make(chan struct{})
	errs := make(chan error, portCount)
	var ready sync.WaitGroup
	ready.Add(portCount)
	for i := 0; i < portCount; i++ {
		port := 3000 + i
		go func() {
			ready.Done()
			<-start
			errs <- writer.UpdatePortSecurity(port, &SecurityInfo{
				BasicAuth:      true,
				IPRestrictions: true,
				CustomDomain:   true,
			})
		}()
	}
	ready.Wait()
	close(start)
	for i := 0; i < portCount; i++ {
		if err := <-errs; err != nil {
			t.Fatalf("update port security: %v", err)
		}
	}

	result, err := (&Reader{registryPath: registryPath}).Read()
	if err != nil {
		t.Fatalf("read final registry: %v", err)
	}
	for i := 0; i < portCount; i++ {
		port := 3000 + i
		security := result.Ports[fmt.Sprintf("%d", port)].Security
		if security == nil || !security.BasicAuth || !security.IPRestrictions || !security.CustomDomain {
			t.Errorf("security update for port %d was lost: %#v", port, security)
		}
	}
}

func TestWriterWriteReleasesLockAfterFailure(t *testing.T) {
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")
	lockPath := registryPath + ".lock"
	if err := os.Mkdir(registryPath, 0o755); err != nil {
		t.Fatalf("create invalid registry target: %v", err)
	}
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		t.Fatalf("create stale lock: %v", err)
	}
	staleTime := time.Now().Add(-11 * time.Second)
	if err := os.Chtimes(lockPath, staleTime, staleTime); err != nil {
		t.Fatalf("age stale lock: %v", err)
	}

	if err := NewWriter(registryPath).Write(emptyRegistry()); err == nil {
		t.Fatal("expected write to a directory to fail")
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatalf("lock remained after write failure: %v", err)
	}
}

func emptyRegistry() *RegistryData {
	return &RegistryData{
		Ports:   make(map[string]PortRegistration),
		Version: "1.0.0",
	}
}

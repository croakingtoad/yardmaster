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

func TestWriterWriteSerializesConcurrentWrites(t *testing.T) {
	tmpDir := t.TempDir()
	registryPath := filepath.Join(tmpDir, "registry.json")
	lockPath := registryPath + ".lock"
	initial := []byte(`{"ports":{},"version":"initial"}`)
	if err := os.WriteFile(registryPath, initial, 0o644); err != nil {
		t.Fatalf("write initial registry: %v", err)
	}
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		t.Fatalf("hold registry lock: %v", err)
	}

	const writeCount = 32
	writer := NewWriter(registryPath)
	start := make(chan struct{})
	errs := make(chan error, writeCount)
	completed := make(chan struct{}, writeCount)
	var ready sync.WaitGroup
	ready.Add(writeCount)
	for i := 0; i < writeCount; i++ {
		go func(writeNumber int) {
			ready.Done()
			<-start
			data := emptyRegistry()
			data.Version = fmt.Sprintf("write-%d", writeNumber)
			errs <- writer.Write(data)
			completed <- struct{}{}
		}(i)
	}
	ready.Wait()
	close(start)

	prematureWrite := false
	select {
	case <-completed:
		prematureWrite = true
	case <-time.After(50 * time.Millisecond):
	}
	if prematureWrite {
		if err := os.Remove(lockPath); err != nil {
			t.Fatalf("release registry lock after premature write: %v", err)
		}
		for i := 0; i < writeCount; i++ {
			<-errs
		}
		t.Fatal("concurrent write completed while registry lock was held")
	}
	got, err := os.ReadFile(registryPath)
	if err != nil {
		t.Fatalf("read registry while locked: %v", err)
	}
	if string(got) != string(initial) {
		t.Fatalf("registry changed while lock was held: got %q", got)
	}
	if err := os.Remove(lockPath); err != nil {
		t.Fatalf("release registry lock: %v", err)
	}

	for i := 0; i < writeCount; i++ {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent write: %v", err)
		}
	}

	encoded, err := os.ReadFile(registryPath)
	if err != nil {
		t.Fatalf("read final registry: %v", err)
	}
	var result RegistryData
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatalf("concurrent writes produced invalid JSON: %v", err)
	}
	if result.Version == "initial" {
		t.Error("registry was not updated after lock release")
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

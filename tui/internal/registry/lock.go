package registry

import (
	"errors"
	"fmt"
	"os"
	"sync"
	"time"
)

const (
	// These defaults mirror proper-lockfile v4 and src/registry.ts.
	registryLockStaleAfter     = 10 * time.Second
	registryLockUpdateInterval = registryLockStaleAfter / 2
	registryLockRetries        = 5
	registryLockMinRetryDelay  = 100 * time.Millisecond
)

var errRegistryLocked = errors.New("registry lock is already held")

var (
	statAcquiredRegistryLock   = os.Stat
	removeAcquiredRegistryLock = os.Remove
)

// Avoid synchronized Go callers exhausting identical retry schedules.
// The directory lock remains the cross-process and cross-language authority.
var registryProcessLocks sync.Map

type registryLock struct {
	path  string
	owner os.FileInfo
	stop  chan struct{}
	done  chan struct{}

	mu         sync.Mutex
	refreshErr error
}

func withRegistryLock(registryPath string, operation func() error) (err error) {
	processLock, _ := registryProcessLocks.LoadOrStore(registryPath, &sync.Mutex{})
	mutex := processLock.(*sync.Mutex)
	mutex.Lock()
	defer mutex.Unlock()

	lock, err := acquireRegistryLock(registryPath)
	if err != nil {
		return err
	}
	defer func() {
		err = errors.Join(err, lock.release())
	}()

	return operation()
}

func acquireRegistryLock(registryPath string) (*registryLock, error) {
	lockPath := registryPath + ".lock"
	delay := registryLockMinRetryDelay
	var lastErr error

	for attempt := 0; attempt <= registryLockRetries; attempt++ {
		lock, err := tryAcquireRegistryLock(lockPath)
		if err == nil {
			return lock, nil
		}
		lastErr = err
		if !errors.Is(err, errRegistryLocked) {
			return nil, fmt.Errorf("acquire registry lock: %w", err)
		}
		if attempt == registryLockRetries {
			break
		}

		time.Sleep(delay)
		delay *= 2
	}

	return nil, fmt.Errorf("acquire registry lock after %d retries: %w", registryLockRetries, lastErr)
}

func tryAcquireRegistryLock(lockPath string) (*registryLock, error) {
	if err := os.Mkdir(lockPath, 0o755); err == nil {
		return newRegistryLock(lockPath)
	} else if !os.IsExist(err) {
		return nil, err
	}

	info, err := os.Stat(lockPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errRegistryLocked
		}
		return nil, err
	}
	if !info.ModTime().Before(time.Now().Add(-registryLockStaleAfter)) {
		return nil, errRegistryLocked
	}

	if err := os.Remove(lockPath); err != nil {
		if os.IsNotExist(err) {
			return nil, errRegistryLocked
		}
		return nil, fmt.Errorf("remove stale registry lock: %w", err)
	}
	if err := os.Mkdir(lockPath, 0o755); err != nil {
		if os.IsExist(err) {
			return nil, errRegistryLocked
		}
		return nil, err
	}

	return newRegistryLock(lockPath)
}

func newRegistryLock(lockPath string) (*registryLock, error) {
	info, err := statAcquiredRegistryLock(lockPath)
	if err != nil {
		statErr := fmt.Errorf("stat acquired registry lock: %w", err)
		cleanupErr := removeAcquiredRegistryLock(lockPath)
		if cleanupErr != nil && !os.IsNotExist(cleanupErr) {
			return nil, errors.Join(
				statErr,
				fmt.Errorf("remove acquired registry lock after stat failure: %w", cleanupErr),
			)
		}
		return nil, statErr
	}

	lock := &registryLock{
		path:  lockPath,
		owner: info,
		stop:  make(chan struct{}),
		done:  make(chan struct{}),
	}
	go lock.refresh()

	return lock, nil
}

func (l *registryLock) refresh() {
	defer close(l.done)
	ticker := time.NewTicker(registryLockUpdateInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := l.refreshOnce(); err != nil {
				l.mu.Lock()
				l.refreshErr = err
				l.mu.Unlock()
				return
			}
		case <-l.stop:
			return
		}
	}
}

func (l *registryLock) refreshOnce() error {
	info, err := os.Stat(l.path)
	if err != nil {
		return fmt.Errorf("stat registry lock before refresh: %w", err)
	}
	if !os.SameFile(l.owner, info) {
		return errors.New("registry lock ownership changed before refresh")
	}

	now := time.Now()
	if err := os.Chtimes(l.path, now, now); err != nil {
		return fmt.Errorf("refresh registry lock: %w", err)
	}
	info, err = os.Stat(l.path)
	if err != nil {
		return fmt.Errorf("stat registry lock after refresh: %w", err)
	}
	if !os.SameFile(l.owner, info) {
		return errors.New("registry lock ownership changed during refresh")
	}

	return nil
}

func (l *registryLock) release() error {
	close(l.stop)
	<-l.done

	l.mu.Lock()
	refreshErr := l.refreshErr
	l.mu.Unlock()

	info, err := os.Stat(l.path)
	if err != nil {
		if os.IsNotExist(err) {
			return errors.Join(refreshErr, errors.New("registry lock disappeared before release"))
		}
		return errors.Join(refreshErr, fmt.Errorf("stat registry lock before release: %w", err))
	}
	if !os.SameFile(l.owner, info) {
		return errors.Join(refreshErr, errors.New("registry lock ownership changed before release"))
	}
	if err := os.Remove(l.path); err != nil {
		return errors.Join(refreshErr, fmt.Errorf("release registry lock: %w", err))
	}

	return refreshErr
}

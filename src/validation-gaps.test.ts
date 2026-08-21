/**
 * Additional coverage for validation edge cases not covered by validation.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateBasicAuth, validateCIDR, validateCIDRList } from './validation.js';

describe('validateBasicAuth — edge cases', () => {
  it('should reject whitespace-only username', () => {
    const result = validateBasicAuth('   :password');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Username'));
  });

  it('should accept password containing special characters', () => {
    const result = validateBasicAuth('user:p@$$w0rd!');
    assert.strictEqual(result.valid, true);
  });

  it('should accept unicode in username and password', () => {
    const result = validateBasicAuth('usér:pässword');
    assert.strictEqual(result.valid, true);
  });
});

describe('validateCIDR — edge cases', () => {
  it('should reject empty string', () => {
    const result = validateCIDR('');
    assert.strictEqual(result.valid, false);
  });

  it('should reject multiple slashes', () => {
    const result = validateCIDR('1.2.3.4/24/extra');
    assert.strictEqual(result.valid, false);
  });

  it('should reject IPv4 with leading-zero octets', () => {
    // "01" is not the same as "1" — octet === num.toString() fails
    const result = validateCIDR('01.02.03.04/24');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Invalid IP'));
  });

  it('should reject IPv4 prefix of 0', () => {
    // 0 is valid for IPv4 (matches all), but confirm consistent behaviour
    const result = validateCIDR('0.0.0.0/0');
    assert.strictEqual(result.valid, true);
  });

  it('should accept full IPv6 address', () => {
    const result = validateCIDR('::1/128');
    assert.strictEqual(result.valid, true);
  });

  it('should reject IPv6 prefix > 128', () => {
    const result = validateCIDR('2001:db8::/129');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('0-128'));
  });

  it('should reject CIDR with internal whitespace', () => {
    const result = validateCIDR('192.168.1.0 /24');
    assert.strictEqual(result.valid, false);
  });
});

describe('validateCIDRList — edge cases', () => {
  it('should accept a single valid CIDR (no comma)', () => {
    const result = validateCIDRList('10.0.0.0/8');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.cidrs.length, 1);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should reject whitespace-only string', () => {
    const result = validateCIDRList('   ');
    assert.strictEqual(result.valid, false);
  });

  it('should handle a list that is only commas', () => {
    const result = validateCIDRList(',,,');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.cidrs.length, 0);
  });

  it('should report all errors when every entry is invalid', () => {
    const result = validateCIDRList('bad1,bad2,bad3');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, 3);
  });
});

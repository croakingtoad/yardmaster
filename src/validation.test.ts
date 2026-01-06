/**
 * Tests for input validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateBasicAuth, validateCIDR, validateCIDRList } from './validation.js';

describe('validateBasicAuth', () => {
  it('should accept valid username:password', () => {
    const result = validateBasicAuth('user:pass123');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.error, undefined);
  });

  it('should reject empty string', () => {
    const result = validateBasicAuth('');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject missing colon', () => {
    const result = validateBasicAuth('userpass');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('username:password'));
  });

  it('should reject empty username', () => {
    const result = validateBasicAuth(':password');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Username'));
  });

  it('should reject empty password', () => {
    const result = validateBasicAuth('username:');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Password'));
  });

  it('should reject multiple colons', () => {
    const result = validateBasicAuth('user:pass:extra');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });
});

describe('validateCIDR', () => {
  it('should accept valid IPv4 CIDR', () => {
    const result = validateCIDR('192.168.1.0/24');
    assert.strictEqual(result.valid, true);
  });

  it('should accept single IP with /32', () => {
    const result = validateCIDR('1.2.3.4/32');
    assert.strictEqual(result.valid, true);
  });

  it('should accept large IPv4 ranges', () => {
    const result = validateCIDR('10.0.0.0/8');
    assert.strictEqual(result.valid, true);
  });

  it('should accept valid IPv6 CIDR', () => {
    const result = validateCIDR('2001:db8::/32');
    assert.strictEqual(result.valid, true);
  });

  it('should reject missing slash', () => {
    const result = validateCIDR('192.168.1.0');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('missing /prefix'));
  });

  it('should reject invalid IP', () => {
    const result = validateCIDR('999.999.999.999/24');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Invalid IP'));
  });

  it('should reject invalid prefix', () => {
    const result = validateCIDR('192.168.1.0/33');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('0-32'));
  });

  it('should reject negative prefix', () => {
    const result = validateCIDR('192.168.1.0/-1');
    assert.strictEqual(result.valid, false);
  });

  it('should reject non-numeric prefix', () => {
    const result = validateCIDR('192.168.1.0/abc');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('must be a number'));
  });
});

describe('validateCIDRList', () => {
  it('should accept comma-separated valid CIDRs', () => {
    const result = validateCIDRList('1.2.3.4/32,10.0.0.0/8');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.cidrs.length, 2);
    assert.deepStrictEqual(result.cidrs, ['1.2.3.4/32', '10.0.0.0/8']);
  });

  it('should handle whitespace', () => {
    const result = validateCIDRList('1.2.3.4/32 , 10.0.0.0/8 ');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.cidrs.length, 2);
  });

  it('should filter empty entries', () => {
    const result = validateCIDRList('1.2.3.4/32,,10.0.0.0/8');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.cidrs.length, 2);
  });

  it('should collect errors for invalid CIDRs', () => {
    const result = validateCIDRList('1.2.3.4/32,invalid,10.0.0.0/8');
    assert.strictEqual(result.valid, true); // Still valid - has some valid CIDRs
    assert.strictEqual(result.cidrs.length, 2);
    assert.ok(result.errors.length > 0);
  });

  it('should reject all invalid CIDRs', () => {
    const result = validateCIDRList('invalid,also-invalid');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.cidrs.length, 0);
    assert.ok(result.errors.length > 0);
  });

  it('should reject empty string', () => {
    const result = validateCIDRList('');
    assert.strictEqual(result.valid, false);
  });
});

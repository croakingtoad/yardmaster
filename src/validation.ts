/**
 * Input validation for ngrok configuration
 * Zero Mock Policy: Real validation functions, no mocks
 */

/**
 * Validates basic auth format (username:password)
 * @param basicAuth - Basic auth string
 * @returns true if valid, error message if invalid
 */
export function validateBasicAuth(basicAuth: string): { valid: boolean; error?: string } {
  if (!basicAuth || basicAuth.trim() === '') {
    return { valid: false, error: 'Basic auth cannot be empty' };
  }

  if (!basicAuth.includes(':')) {
    return { valid: false, error: 'Basic auth must be in format "username:password"' };
  }

  const [username, password] = basicAuth.split(':');

  if (!username || username.trim() === '') {
    return { valid: false, error: 'Username cannot be empty in basic auth' };
  }

  if (password === undefined || password === '') {
    return { valid: false, error: 'Password cannot be empty in basic auth' };
  }

  // Check for multiple colons (only one allowed)
  if (basicAuth.split(':').length > 2) {
    return { valid: false, error: 'Basic auth format invalid: only one colon allowed' };
  }

  return { valid: true };
}

/**
 * Validates a CIDR notation string
 * @param cidr - CIDR string (e.g., "192.168.1.0/24")
 * @returns true if valid, error message if invalid
 */
export function validateCIDR(cidr: string): { valid: boolean; error?: string } {
  if (!cidr || cidr.trim() === '') {
    return { valid: false, error: 'CIDR cannot be empty' };
  }

  const trimmed = cidr.trim();

  // Must contain exactly one slash
  if (!trimmed.includes('/')) {
    return { valid: false, error: `Invalid CIDR "${trimmed}": missing /prefix` };
  }

  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    return { valid: false, error: `Invalid CIDR "${trimmed}": must have format IP/prefix` };
  }

  const [ip, prefixStr] = parts;

  // Validate IP address (IPv4 or IPv6)
  if (!isValidIP(ip)) {
    return { valid: false, error: `Invalid IP address "${ip}" in CIDR` };
  }

  // Validate prefix length
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix)) {
    return { valid: false, error: `Invalid prefix "${prefixStr}": must be a number` };
  }

  // Check prefix range based on IP type
  const isIPv6 = ip.includes(':');
  const maxPrefix = isIPv6 ? 128 : 32;

  if (prefix < 0 || prefix > maxPrefix) {
    return { valid: false, error: `Invalid prefix ${prefix}: must be 0-${maxPrefix} for ${isIPv6 ? 'IPv6' : 'IPv4'}` };
  }

  return { valid: true };
}

/**
 * Validates a comma-separated list of CIDRs
 * @param cidrList - Comma-separated CIDR list
 * @returns Object with valid CIDRs array and any errors
 */
export function validateCIDRList(cidrList: string): {
  valid: boolean;
  cidrs: string[];
  errors: string[]
} {
  if (!cidrList || cidrList.trim() === '') {
    return { valid: false, cidrs: [], errors: ['CIDR list cannot be empty'] };
  }

  const cidrs = cidrList.split(',').map(c => c.trim()).filter(c => c !== '');
  const errors: string[] = [];
  const validCIDRs: string[] = [];

  if (cidrs.length === 0) {
    return { valid: false, cidrs: [], errors: ['No valid CIDRs found in list'] };
  }

  for (const cidr of cidrs) {
    const result = validateCIDR(cidr);
    if (result.valid) {
      validCIDRs.push(cidr);
    } else {
      errors.push(result.error!);
    }
  }

  return {
    valid: validCIDRs.length > 0,
    cidrs: validCIDRs,
    errors
  };
}

/**
 * Basic IP address validation (IPv4 and IPv6)
 * @param ip - IP address string
 * @returns true if valid IP
 */
function isValidIP(ip: string): boolean {
  // IPv4 validation
  if (ip.includes('.')) {
    const octets = ip.split('.');
    if (octets.length !== 4) return false;

    return octets.every(octet => {
      const num = parseInt(octet, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && octet === num.toString();
    });
  }

  // IPv6 validation (simplified)
  if (ip.includes(':')) {
    // Must have at least 2 colons
    if (ip.split(':').length < 3) return false;

    // Check for valid hex characters
    const hexPattern = /^[0-9a-fA-F:]+$/;
    if (!hexPattern.test(ip)) return false;

    // Cannot start or end with single colon (unless ::)
    if ((ip.startsWith(':') && !ip.startsWith('::')) ||
        (ip.endsWith(':') && !ip.endsWith('::'))) {
      return false;
    }

    return true;
  }

  return false;
}

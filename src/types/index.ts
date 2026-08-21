/**
 * Yardmaster Types
 * Zero Mock Policy: All types represent real data structures
 */

import type { LogWriteResult } from '../logger.js';

export interface PortRegistration {
  app_name: string;
  port: number;
  ngrok_url: string | null;
  pid: number | null;
  registered_at: string;
  status: 'active' | 'released';
  monitor?: boolean;
  security?: {
    basic_auth: boolean;
    ip_restrictions: boolean;
    custom_domain: boolean;
  };
}

export interface RegistryData {
  ports: Record<number, PortRegistration>;
  version: string;
  last_updated: string;
}

export interface Config {
  port_range: {
    start: number;
    end: number;
  };
  ngrok: {
    auth_token: string;
    region: string;
    domain?: string;
    basic_auth?: string;
    ip_allow?: string[];
    ip_deny?: string[];
  };
  registry: {
    path: string;
  };
  server: {
    name: string;
    version: string;
    description: string;
  };
}

export interface TunnelInfo {
  app_name: string;
  url: string;
  port: number;
}

export interface PortRegistrationResult {
  success: boolean;
  app_name: string;
  port: number;
  ngrok_url: string;
  message?: string;
  activity_log?: LogWriteResult;
}

export interface PortReleaseResult {
  success: boolean;
  app_name: string;
  port: number;
  message?: string;
  activity_log?: LogWriteResult;
}

export interface PortQueryResult {
  total: number;
  registrations: PortRegistration[];
}

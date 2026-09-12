/**
 * Yardmaster Types
 * Zero Mock Policy: All types represent real data structures
 */

import type { LogWriteResult } from '../logger.js';

declare const configFieldVisibility: unique symbol;

export type ConfigFieldVisibility = 'display-safe' | 'secret';

/**
 * Bind a configuration leaf to its display sensitivity without changing its
 * runtime representation or requiring callers to wrap ordinary values.
 */
export type ConfigField<
  Value,
  Visibility extends ConfigFieldVisibility
> = Value & { readonly [configFieldVisibility]?: Visibility };

export type ConfigFieldVisibilityOf<Value> =
  Value extends {
    readonly [configFieldVisibility]?: infer Visibility;
  }
    ? Extract<Visibility, ConfigFieldVisibility>
    : never;

export interface PortRegistration {
  app_name: string;
  port: number;
  ngrok_url: string | null;
  pid: number | null;
  registered_at: string;
  status: 'active' | 'released';
  notes?: string | null;
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
    start: ConfigField<number, 'display-safe'>;
    end: ConfigField<number, 'display-safe'>;
  };
  ngrok: {
    auth_token: ConfigField<string, 'secret'>;
    region: ConfigField<string, 'display-safe'>;
    domain?: ConfigField<string, 'display-safe'>;
    basic_auth?: ConfigField<string, 'secret'>;
    ip_allow?: ConfigField<string[], 'display-safe'>;
    ip_deny?: ConfigField<string[], 'display-safe'>;
  };
  registry: {
    path: ConfigField<string, 'display-safe'>;
  };
  server: {
    name: ConfigField<string, 'display-safe'>;
    version: ConfigField<string, 'display-safe'>;
    description: ConfigField<string, 'display-safe'>;
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
  notes?: string | null;
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

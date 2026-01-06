/**
 * Yardmaster Types
 * Zero Mock Policy: All types represent real data structures
 */

export interface PortRegistration {
  app_name: string;
  port: number;
  ngrok_url: string | null;
  pid: number | null;
  registered_at: string;
  status: 'active' | 'released';
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
}

export interface PortReleaseResult {
  success: boolean;
  app_name: string;
  port: number;
  message?: string;
}

export interface PortQueryResult {
  total: number;
  registrations: PortRegistration[];
}

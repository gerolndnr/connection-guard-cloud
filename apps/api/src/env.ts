export interface Env {
  DB: D1Database;
  PUBLIC: KVNamespace;
  METRICS?: AnalyticsEngineDataset;
  ASSETS?: Fetcher;
  INSTALL_LIMITER?: RateLimit;
  SYNC_LIMITER?: RateLimit;
  INTEL_LIMITER?: RateLimit;
  /** Intel Cloud (Player Intelligence), a separate private Worker bound by Service Binding. Absent when self-hosted. */
  INTEL?: IntelService;
  ENVIRONMENT: "development" | "test" | "production";
  APP_ORIGIN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET?: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET?: string;
  DPA_VERSION: string;
  /**
   * Share of logins (0..1) the connection probe's session check asks Mojang about, sent to linked servers with every
   * sync (plugin docs/CLOUD.md#connection-probe-counts-velocity). Unset or invalid: the field is left out and plugins keep
   * their last value (1 by default). "0" stops the check on all servers without a plugin release.
   */
  PROBE_SESSION_CHECK?: string;
  CONFIG_SECRET_KEY?: string;
  /** PostHog project token (public). Empty disables product analytics everywhere. */
  POSTHOG_KEY?: string;
  /** PostHog ingestion host, or the managed reverse proxy in front of it. */
  POSTHOG_HOST?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  avatar: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

/** A result Intel Cloud computed; apps/api returns it to the plugin or dashboard as is. */
export interface IntelResult { status: number; body: unknown }
export interface IntelCaller { network_id: string; install_id: string }

/** The RPC methods of Intel Cloud's `IntelRpc` entrypoint (connection-guard-intel-cloud, src/rpc.ts). */
export interface IntelService {
  lookup(caller: IntelCaller, json: unknown): Promise<IntelResult>;
  contribute(caller: IntelCaller, json: unknown): Promise<IntelResult>;
  report(caller: { network_id: string }, uuid: string, sections?: string[], detail?: "summary" | "full"): Promise<IntelResult>;
  forgetNetwork(networkId: string): Promise<boolean>;
  forgetInstall(installId: string): Promise<boolean>;
  info(): Promise<IntelInfo>;
}
export interface IntelInfo {
  offered: boolean;
  agreement_version: string | null;
  accept_kinds: string[];
  sources: { id: string; name: string; available: boolean }[];
}

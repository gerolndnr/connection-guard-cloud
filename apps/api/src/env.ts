export interface Env {
  DB: D1Database;
  PUBLIC: KVNamespace;
  METRICS?: AnalyticsEngineDataset;
  ASSETS?: Fetcher;
  INSTALL_LIMITER?: RateLimit;
  SYNC_LIMITER?: RateLimit;
  ENVIRONMENT: "development" | "test" | "production";
  APP_ORIGIN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET?: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET?: string;
  DPA_VERSION: string;
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

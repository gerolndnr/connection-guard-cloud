/// <reference types="astro/client" />
interface ImportMetaEnv {
  /** PostHog project token (public). Empty: no analytics script is loaded. */
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_POSTHOG_HOST?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

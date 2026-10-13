import { describe, expect, it } from "vitest";
import { parseRelease, releaseFromRedirect } from "../src/dashboard.ts";

describe("plugin release", () => {
  it("reads the newest published release", () => {
    expect(parseRelease({ tag_name: "0.6.1", html_url: "https://github.com/gerolndnr/connection-guard/releases/tag/0.6.1", published_at: "2026-10-13T14:00:00Z" }))
      .toEqual({ version: "0.6.1", url: "https://github.com/gerolndnr/connection-guard/releases/tag/0.6.1", published_at: "2026-10-13T14:00:00Z" });
    expect(parseRelease({ tag_name: "v0.7.0", html_url: "https://example.com/x" })!.url).toBe("https://connectionguard.net/download");
  });
  it("ignores drafts, pre-releases and odd tags", () => {
    expect(parseRelease({ tag_name: "0.7.0", draft: true })).toBeNull();
    expect(parseRelease({ tag_name: "0.7.0", prerelease: true })).toBeNull();
    expect(parseRelease({ tag_name: "nightly" })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
  it("falls back to the release page's redirect", () => {
    expect(releaseFromRedirect("https://github.com/gerolndnr/connection-guard/releases/tag/0.6.1"))
      .toEqual({ version: "0.6.1", url: "https://github.com/gerolndnr/connection-guard/releases/tag/0.6.1", published_at: "" });
    expect(releaseFromRedirect("https://github.com/gerolndnr/connection-guard/releases")).toBeNull();
    expect(releaseFromRedirect("https://evil.example/releases/tag/9.9.9")).toBeNull();
    expect(releaseFromRedirect(null)).toBeNull();
  });
});

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { track } from "../analytics.ts";
import { num } from "../format.ts";
import { LATER_MS, REVIEW_LINKS, writeReviewState, type ReviewState } from "../review.ts";

/** A quiet request for a review, shown only when review.ts says the moment is right. */
export function ReviewPrompt({ checks, found }: { checks: number; found: number }) {
  const [answered, setAnswered] = useState<ReviewState | null>(null);
  useEffect(() => { track("review_prompt_shown", { checks_bucket: checks >= 10_000 ? "10k+" : checks >= 1_000 ? "1k+" : "100+" }); }, []);
  if (answered) return null;
  const answer = (s: ReviewState, event: string, props: Record<string, unknown> = {}) => { writeReviewState(s); setAnswered(s); track(event, props); };
  const review = (target: keyof typeof REVIEW_LINKS) => answer({ state: "done" }, "review_prompt_clicked", { target });

  return (
    <section aria-labelledby="review-h" className="card mt-4 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
      <Star aria-hidden className="hidden size-5 shrink-0 text-accent sm:block" />
      <div className="min-w-0 flex-1">
        <h2 id="review-h" className="font-medium">Is Connection Guard keeping your server clean?</h2>
        <p className="mt-0.5 text-[0.8125rem] text-fg-2">
          This week it checked {num(checks)} {checks === 1 ? "player" : "players"} and found {num(found)} {found === 1 ? "VPN or proxy" : "VPNs and proxies"}.
          A short review helps other server owners find it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={REVIEW_LINKS.spigotmc} target="_blank" rel="noreferrer" className="btn btn-primary h-8 no-underline" onClick={() => review("spigotmc")}>Review on SpigotMC</a>
        <a href={REVIEW_LINKS.hangar} target="_blank" rel="noreferrer" className="btn btn-secondary h-8 no-underline" onClick={() => review("hangar")}>Star on Hangar</a>
        <button type="button" className="btn btn-ghost h-8" onClick={() => answer({ state: "later", until: Date.now() + LATER_MS }, "review_prompt_later")}>Later</button>
        <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Don't ask again" title="Don't ask again"
          onClick={() => answer({ state: "never" }, "review_prompt_dismissed")}><X aria-hidden className="size-4" /></button>
      </div>
    </section>
  );
}


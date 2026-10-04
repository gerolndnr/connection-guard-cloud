// PostHog without external script loading, plus the extensions the site uses, in one neutrally named chunk.
// Content blockers match PostHog's own lazy-loaded file names (dead-clicks-autocapture.js and the like).
import posthog from "posthog-js/dist/module.no-external";
import "posthog-js/dist/web-vitals-with-attribution";
import "posthog-js/dist/dead-clicks-autocapture";
import "posthog-js/dist/exception-autocapture";

export default posthog;

// PostHog without external script loading, plus the extensions the dashboard uses, in one neutrally named chunk.
// Content blockers match PostHog's own lazy-loaded file names (posthog-recorder.js, dead-clicks-autocapture.js).
import posthog from "posthog-js/dist/module.no-external";
import "posthog-js/dist/posthog-recorder";
import "posthog-js/dist/web-vitals-with-attribution";
import "posthog-js/dist/dead-clicks-autocapture";
import "posthog-js/dist/exception-autocapture";

export default posthog;

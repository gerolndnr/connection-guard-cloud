import benchmark from "../data/benchmark.json";
import intel from "../data/intel.json";
import stats from "../data/stats.json";

// The next Site build uses the same public data as the currently deployed pages on source outages.
export function GET() {
  return Response.json({ schema: 1, benchmark, intel, stats });
}

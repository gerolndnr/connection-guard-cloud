import { Link } from "@tanstack/react-router";
import { Shell } from "../components/Shell.tsx";

export function NotFound() {
  return (
    <Shell>
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="mono text-sm text-fg-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Page not found</h1>
        <p className="mt-2 text-fg-2">This address does not exist.</p>
        <Link to="/" className="btn btn-secondary mt-6 no-underline">Go to your networks</Link>
      </div>
    </Shell>
  );
}

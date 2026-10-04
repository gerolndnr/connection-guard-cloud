import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { track } from "../analytics.ts";

type Theme = "system" | "light" | "dark";
const KEY = "cg-theme";

function read(): Theme {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** System / light / dark. The choice is a per-browser convenience; system is the default. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    apply(theme);
    try { if (theme === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, theme); } catch { /* private mode */ }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  const options: { id: Theme; label: string; Icon: typeof Sun }[] = [
    { id: "system", label: "System theme", Icon: Monitor }, { id: "light", label: "Light theme", Icon: Sun }, { id: "dark", label: "Dark theme", Icon: Moon },
  ];
  const current = options.find((o) => o.id === theme)!;
  const next = options[(options.indexOf(current) + 1) % options.length]!;
  return (
    <>
    {/* Phones: one button that cycles system, light, dark. */}
    <button type="button" className="btn btn-ghost size-8 p-0 sm:hidden" aria-label={`${current.label}. Switch to ${next.label.toLowerCase()}`}
      title={current.label} onClick={() => { setTheme(next.id); track("theme_changed", { theme: next.id }); }}>
      <current.Icon className="size-4" />
    </button>
    <div role="group" aria-label="Theme" className="hidden rounded-full border border-line p-0.5 sm:flex">
      {options.map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-label={label} title={label} aria-pressed={theme === id} onClick={() => { setTheme(id); track("theme_changed", { theme: id }); }}
          className={`grid size-6 place-items-center rounded-full transition-colors ${theme === id ? "bg-subtle text-fg" : "text-fg-3 hover:text-fg"}`}>
          <Icon className="size-3.5" strokeWidth={2} />
        </button>
      ))}
    </div>
    </>
  );
}

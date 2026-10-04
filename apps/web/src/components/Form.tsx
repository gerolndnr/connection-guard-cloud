import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, Search, X } from "lucide-react";
import { COUNTRIES } from "../countries.ts";
import { countryName } from "../format.ts";

export function Section({ title, description, children, id, managed }: { title: string; description?: ReactNode; children: ReactNode; id?: string; managed?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="card scroll-mt-28">
      <div className="border-b border-line px-6 py-5">
        <h2 id={`${id ?? title}-h`} className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em]">
          {title}
          {managed && <span className="badge badge-neutral h-5 text-[0.6875rem] font-medium" title="Set in the dashboard; overrides config.yml">Dashboard</span>}
        </h2>
        {description && <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-fg-2">{description}</p>}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

/** One setting: label and help on the left, control on the right (stacked on phones). */
export function Row({ label, help, children, managed, error }: { label: ReactNode; help?: ReactNode; children: ReactNode; managed?: boolean; error?: string | undefined }) {
  return (
    <div className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-start sm:gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {label}
          {managed && <span className="badge badge-neutral h-5 text-[0.6875rem]" title="Set in the dashboard; overrides config.yml">Dashboard</span>}
        </div>
        {help && <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-2">{help}</p>}
      </div>
      <div className="min-w-0">
        {children}
        {error && <p role="alert" className="mt-1.5 text-[0.8125rem] text-danger-text">{error}</p>}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50 ${checked ? "bg-accent" : "bg-line-strong"}`}>
      <span className={`inline-block size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-150 ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Choice<T extends string>({ value, onChange, options, name }: {
  value: T; onChange: (v: T) => void; name: string; options: { value: T; title: string; body?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2">
      {options.map((o) => (
        <label key={o.value} className={`flex cursor-pointer gap-3 rounded-lg border px-4 py-3 transition-colors ${value === o.value ? "border-accent bg-accent-soft/60" : "border-line hover:border-line-strong"}`}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="block font-medium">{o.title}</span>
            {o.body && <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-fg-2">{o.body}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export type SecretEdit = { mode: "keep" } | { mode: "set"; value: string } | { mode: "clear" };

/** Compact segmented choice with a sentence describing the selected option underneath. */
export function Segmented<T extends string>({ value, onChange, options, name }: {
  value: T; onChange: (v: T) => void; name: string; options: { value: T; title: string; body?: string }[];
}) {
  const current = options.find((o) => o.value === value);
  return (
    <div>
      <div role="radiogroup" aria-label={name} className="segmented">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.title}</button>
        ))}
      </div>
      {current?.body && <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-2">{current.body}</p>}
    </div>
  );
}

/** A key or URL the dashboard never shows again once stored; only "set" and its last four characters. */
export function SecretField({ state, edit, onEdit, placeholder, type = "password" }: {
  state: { set: boolean; hint: string | null } | undefined; edit: SecretEdit; onEdit: (e: SecretEdit) => void; placeholder: string; type?: "password" | "url";
}) {
  const id = useId();
  if (edit.mode === "set") {
    return (
      <div className="flex gap-2">
        <input id={id} className="ph-no-capture input mono" type={type === "url" ? "url" : "password"} autoComplete="off" spellCheck={false} placeholder={placeholder}
          value={edit.value} onChange={(e) => onEdit({ mode: "set", value: e.target.value.trim() })} autoFocus />
        <button type="button" className="btn btn-ghost" onClick={() => onEdit({ mode: "keep" })}>Cancel</button>
      </div>
    );
  }
  const isSet = edit.mode === "keep" && state?.set;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`mono flex h-9 min-w-0 flex-1 items-center rounded-md border border-line bg-subtle px-3 text-[0.8125rem] ${isSet ? "text-fg" : "text-fg-3"}`}>
        {edit.mode === "clear" ? "Will be removed" : isSet ? `•••• ${state?.hint ?? ""}` : "Not set"}
      </span>
      <button type="button" className="btn btn-secondary" onClick={() => onEdit({ mode: "set", value: "" })}>{isSet ? "Replace" : "Add"}</button>
      {(isSet || edit.mode === "clear") && (
        <button type="button" className="btn btn-ghost" onClick={() => onEdit(edit.mode === "clear" ? { mode: "keep" } : { mode: "clear" })}>
          {edit.mode === "clear" ? "Undo" : "Remove"}
        </button>
      )}
    </div>
  );
}

/** Free-form list (player names or IPs). Enter or comma adds; backspace on empty removes the last. */
export function TagInput({ values, onChange, placeholder, max = 200 }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s && s.length <= 64 && !values.includes(s));
    if (items.length) onChange([...values, ...items].slice(0, max));
    setDraft("");
  };
  return (
    <div className="ph-no-capture flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]">
      {values.map((v) => (
        <span key={v} className="mono inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 text-[0.75rem]">
          {v}
          <button type="button" aria-label={`Remove ${v}`} className="text-fg-3 hover:text-fg" onClick={() => onChange(values.filter((x) => x !== v))}><X className="size-3" /></button>
        </span>
      ))}
      <input className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-fg-3" placeholder={values.length ? "" : placeholder} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => draft && add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }} />
    </div>
  );
}

/** Searchable country checklist with the selection as removable chips on top. */
export function CountryPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(term) || c.code.toLowerCase() === term) : COUNTRIES;
  }, [q]);
  const toggle = (code: string) => onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code].sort());
  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle py-0.5 pl-2.5 pr-1 text-[0.8125rem]">
              {countryName(c)}
              <button type="button" aria-label={`Remove ${countryName(c)}`} className="grid size-5 place-items-center rounded-full text-fg-3 hover:bg-line hover:text-fg" onClick={() => toggle(c)}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <label className="relative block border-b border-line">
          <span className="sr-only">Search countries</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <input className="h-9 w-full bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-fg-3" placeholder="Search countries" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ul className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable aria-label="Countries">
          {list.map((c) => {
            const on = selected.includes(c.code);
            return (
              <li key={c.code} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(c.code)} className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-subtle">
                  <span>{c.name} <span className="mono text-[0.75rem] text-fg-3">{c.code}</span></span>
                  {on && <Check aria-hidden className="size-4 text-accent" />}
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-3 py-2 text-sm text-fg-3">No country matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}

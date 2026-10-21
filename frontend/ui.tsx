import React, { useRef, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
export async function api(path: string, method = "GET", value?: unknown) {
  const r = await fetch("/api" + path, {
    method,
    headers: value !== undefined ? { "Content-Type": "application/json" } : {},
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Request failed");
  return data;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Multi({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <details className="multi">
      <summary>
        {label}
        {selected.length > 0 && <span>{selected.length}</span>}
        <span className="caret">⌄</span>
      </summary>
      <div className="multi-menu">
        <div className="menu-heading">
          {label}
          <button className="text-button" onClick={() => onChange([])}>
            Reset
          </button>
        </div>
        {values.map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={() =>
                onChange(
                  selected.includes(v)
                    ? selected.filter((x) => x !== v)
                    : [...selected, v],
                )
              }
            />
            {v}
          </label>
        ))}
        {values.length === 0 && <p>No imported values yet.</p>}
      </div>
    </details>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "LIGHT" },
  { value: "dark", label: "DARK" },
  { value: "system", label: "SYSTEM" },
];

/**
 * Light / dark / system theme switch (fig 4.4 settings). The preference is a
 * device setting (localStorage) applied to <html data-theme>; the inline script
 * in the root layout reads it before paint so there's no flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) ?? "system";
    setTheme(current);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private mode / storage unavailable — the in-page change still applies
    }
  };

  return (
    <div className="flex border-[1.5px] border-ink">
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={theme === opt.value}
          onClick={() => choose(opt.value)}
          className={`px-3 py-[7px] text-[10px] tracking-[0.1em] ${
            theme === opt.value
              ? "bg-ink font-bold text-bg-base"
              : `font-medium text-ink-muted ${i > 0 ? "border-l border-ink/30" : ""}`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

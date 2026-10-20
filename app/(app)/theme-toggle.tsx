"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** Switches light/dark and remembers the choice; the initial theme is applied by a script in the root layout. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage can be blocked; the theme still applies for this visit.
    }
  }

  const label = dark ? "Tema claro" : "Tema escuro";
  return (
    <SidebarMenuButton tooltip={label} onClick={toggle} suppressHydrationWarning>
      {dark ? <Sun /> : <Moon />}
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

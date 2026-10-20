"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Input } from "@/components/ui/input";

/** Password field with a reveal toggle. The toggle's name avoids the word "senha" so label queries stay unambiguous. */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={isVisible ? "text" : "password"} className="h-10 pr-10" />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? "Ocultar caracteres" : "Mostrar caracteres"}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

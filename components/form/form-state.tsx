"use client";

import { Loader2 } from "lucide-react";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionState, idleState } from "@/lib/action-state";

const FormStateContext = createContext<ActionState>(idleState);

export const FormStateProvider = FormStateContext.Provider;

export function useActionFormState(): ActionState {
  return useContext(FormStateContext);
}

/** The value the user last submitted for this field, when the form was rejected. */
function useSubmitted(name: string): string | string[] | undefined {
  return useActionFormState().values?.[name];
}

const controlClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm";

interface FieldShellProps {
  name: string;
  label: string;
  hint?: string;
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
}

function FieldShell({ name, label, hint, children }: FieldShellProps) {
  const error = useActionFormState().fieldErrors?.[name];
  const noteId = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children(noteId, Boolean(error))}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = { name: string; label: string; hint?: string } & Omit<
  ComponentProps<typeof Input>,
  "name" | "id"
>;

export function TextField({ name, label, hint, defaultValue, ...inputProps }: TextFieldProps) {
  const submitted = useSubmitted(name);
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(describedBy, invalid) => (
        <Input
          id={name}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          defaultValue={typeof submitted === "string" ? submitted : defaultValue}
          {...inputProps}
        />
      )}
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  name: string;
  label: string;
  options: readonly SelectOption[];
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}

/** Native select: reliable with FormData, keyboards and mobile pickers. */
export function SelectField({ name, label, options, hint, placeholder, defaultValue, required, onChange }: SelectFieldProps) {
  const submitted = useSubmitted(name);
  const initial = typeof submitted === "string" ? submitted : (defaultValue ?? "");
  return (
    <FieldShell name={name} label={label} hint={hint}>
      {(describedBy, invalid) => (
        <select
          id={name}
          name={name}
          defaultValue={initial}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          className={controlClass}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

interface CheckboxFieldProps {
  name: string;
  label: string;
  defaultChecked?: boolean;
  value?: string;
  /** "chip" renders a toggle pill (the input stays a real, keyboard-focusable checkbox). */
  variant?: "default" | "chip";
}

export function CheckboxField({ name, label, defaultChecked, value, variant = "default" }: CheckboxFieldProps) {
  const id = value ? `${name}-${value}` : name;
  const values = useActionFormState().values;
  const submitted = values?.[name];
  // After a rejected submit, checkboxes follow what the user had ticked.
  const checked = values
    ? Array.isArray(submitted) ? submitted.includes(value ?? "on") : submitted !== undefined && (value === undefined || submitted === value)
    : defaultChecked;
  if (variant === "chip") {
    return (
      <label htmlFor={id} className="relative cursor-pointer select-none">
        <input id={id} type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
        <span className="flex h-9 w-full items-center justify-center rounded-lg border border-input px-0 text-sm text-muted-foreground transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-checked:text-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
          {label}
        </span>
      </label>
    );
  }
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

/** Error text for fields that have no single input (e.g. a group of checkboxes). */
export function FieldError({ name }: { name: string }) {
  const error = useActionFormState().fieldErrors?.[name];
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  );
}

/** Message not tied to a single field (permission, conflict, unexpected error). */
export function FormMessage() {
  const state = useActionFormState();
  if (state.status !== "error" || !state.message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.message}
    </p>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? "Salvando…" : children}
    </Button>
  );
}

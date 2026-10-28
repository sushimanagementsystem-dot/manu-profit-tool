"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Validation } from "@/lib/audit/item-edit";
import { cn } from "@/lib/utils";

type EditableCellProps = {
  /** What this cell is, for people who cannot see it: "units sold of Classic Burger". */
  label: string;
  /** What the editor starts with. */
  startValue: string;
  /** "text" for a name; "decimal" brings up the number pad on a phone. */
  kind: "text" | "decimal";
  placeholder?: string;
  /** No dotted underline: the content is already a button of its own ("Add cost"). */
  plain?: boolean;
  align: "left" | "right";
  /** Open or closed is owned by the table, so only one cell is ever being edited. */
  editing: boolean;
  onEditingChange: (open: boolean) => void;
  /** Another edit is being saved, so this one cannot start. */
  disabled?: boolean;
  validate: (raw: string) => Validation;
  /** Saves a validated value. Throw an Error to keep the editor open and show its message. */
  onSave: (value: string) => Promise<void>;
  children: React.ReactNode;
};

/**
 * A figure that turns into an input when clicked, with Save and Cancel. Enter saves and Escape
 * cancels. The editor stays open, with the reason, if the value is invalid or the server refuses
 * it; the client's text is never thrown away by a failed save.
 */
export function EditableCell({
  label,
  startValue,
  kind,
  placeholder,
  plain = false,
  align,
  editing,
  onEditingChange,
  disabled,
  validate,
  onSave,
  children,
}: EditableCellProps) {
  const [draft, setDraft] = useState(startValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const errorId = useId();

  // The editor opens with the whole value selected, so typing replaces it.
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  // After a refused value the input goes back in focus, so the client can correct it or press
  // Escape. It is only focusable once saving has ended: a disabled input cannot take focus.
  useEffect(() => {
    if (editing && !saving && error) inputRef.current?.focus();
  }, [editing, saving, error]);

  // Closing hands focus back to the figure, so keyboard users do not lose their place.
  useEffect(() => {
    if (wasEditing.current && !editing) openerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  async function save() {
    if (saving) return;
    const checked = validate(draft);
    if (!checked.ok) {
      setError(checked.message);
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(checked.value);
      onEditingChange(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be saved. Please try again.");
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (saving) return;
    onEditingChange(false);
  }

  if (!editing) {
    return (
      <button
        ref={openerRef}
        type="button"
        onClick={() => {
          // Each opening starts from the current figure, never from a half-typed old draft. It is
          // read here, once, so new results arriving mid-edit cannot overwrite what is being typed.
          setDraft(startValue);
          setError(null);
          onEditingChange(true);
        }}
        disabled={disabled}
        aria-label={`Edit ${label}`}
        className={cn(
          "group inline-flex items-center gap-1 rounded-none text-inherit transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
          plain
            ? "py-0.5"
            : "-mx-[7px] min-w-[52px] border-b border-dotted border-muted-foreground/50 px-[7px] py-[5px] hover:rounded-lg hover:border-transparent hover:bg-muted focus-visible:rounded-lg focus-visible:bg-muted",
          align === "right" ? "justify-end text-right" : "justify-start text-left",
        )}
      >
        <span>{children}</span>
        {!plain && (
          <Pencil
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className={cn("flex flex-col gap-1", align === "right" ? "items-end" : "items-start")}
    >
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          inputMode={kind === "decimal" ? "decimal" : "text"}
          autoComplete="off"
          placeholder={placeholder}
          disabled={saving}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn("h-8", kind === "text" ? "w-44 text-left" : "w-24 text-right")}
        />
        <Button
          type="submit"
          size="icon"
          variant="outline"
          disabled={saving}
          aria-label={`Save ${label}`}
          title="Save (Enter)"
          className="text-brand-ink"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={cancel}
          disabled={saving}
          aria-label={`Cancel editing ${label}`}
          title="Cancel (Esc)"
        >
          <X />
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="max-w-64 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

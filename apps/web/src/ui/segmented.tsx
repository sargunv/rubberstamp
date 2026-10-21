import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";

/** One choice among a few, such as a list filter. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const chosen = options.find((o) => o.value === next[0]);
        if (chosen) onChange(chosen.value);
      }}
      aria-label={label}
      className="flex rounded-sm border border-rule bg-sheet p-0.5"
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="rounded-xs px-3 py-1 text-sm text-muted hover:text-ink data-pressed:bg-ink data-pressed:text-paper"
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

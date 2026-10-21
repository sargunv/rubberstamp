import type { CSSProperties } from "react";

/** A stable pseudo-random number in [0, 1) for a string. */
function jitter(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

type StampProps = {
  children: string;
  /** How hard it was pressed, from 0 to 1. */
  pressure?: number;
  seed: string;
  delay?: number;
  className?: string;
};

/** A label as Rubberstamp would stamp it, pressed as hard as Rubberstamp is sure. */
export function Stamp({
  children,
  pressure = 1,
  seed,
  delay = 0,
  className = "",
}: StampProps) {
  const r = jitter(seed);
  const style: CSSProperties = {
    "--tilt": `${(r * 6 - 3).toFixed(2)}deg`,
    "--grain": `${Math.round(r * 160)}px ${Math.round(jitter(`${seed}y`) * 80)}px`,
    "--pressure": (0.35 + 0.65 * pressure).toFixed(2),
    "--delay": `${delay}ms`,
  };
  return (
    <span className={`stamp ${className}`} style={style}>
      {children}
    </span>
  );
}

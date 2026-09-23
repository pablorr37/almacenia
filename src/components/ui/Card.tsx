import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-3.5 shadow-[0_1px_3px_rgba(32,26,21,0.05)] ${className}`}
      {...props}
    />
  );
}

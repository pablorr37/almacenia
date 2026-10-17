import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "accent" | "outline";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-cta hover:bg-primary-dark",
  accent:
    "bg-accent text-white shadow-cta-accent hover:bg-accent-dark",
  outline: "bg-surface text-text border border-border hover:bg-bg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`rounded-control px-5 py-3.5 text-[15px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";

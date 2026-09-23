import { type InputHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, id, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold text-text">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`rounded-control border border-border bg-surface px-3.5 py-3.5 text-[15px] font-sans text-text placeholder:text-text-2 focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(14,107,92,0.12)] ${className}`}
        {...props}
      />
    </div>
  ),
);
Input.displayName = "Input";

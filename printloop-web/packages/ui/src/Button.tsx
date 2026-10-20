import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "dark" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary: "pl-btn-primary",
  dark: "pl-btn-dark",
  ghost: "pl-btn-ghost",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "pl-btn-sm",
  md: "",
  lg: "pl-btn-lg",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  return cx(variantClass[variant], sizeClass[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  arrow?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", arrow, loading, children, className = "", disabled, type = "button", ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        buttonClass(variant, size, className),
        (disabled || loading) && "opacity-60 cursor-not-allowed",
      )}
      {...rest}
    >
      <span className="flex items-center gap-2">
        {loading ? (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : null}
        {children}
        {arrow ? <span className="font-extrabold pl-arrow">→</span> : null}
      </span>
    </button>
  ),
);
Button.displayName = "Button";

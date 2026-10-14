import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonSize = "small" | "medium";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-black disabled:bg-ink/40",
  accent: "bg-brand-500 text-white hover:bg-brand-600 disabled:bg-brand-500/50",
  secondary: "border border-line bg-white text-ink hover:bg-canvas disabled:text-muted",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};
const SIZE_CLASSES: Record<ButtonSize, string> = { small: "h-8 px-3 text-xs", medium: "h-10 px-4 text-sm" };

export function getButtonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "medium") {
  return `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({ variant, size, className = "", ...buttonProps }: ButtonProps) {
  return <button type="button" className={`${getButtonClasses(variant, size)} ${className}`} {...buttonProps} />;
}

interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  isExternal?: boolean;
}

export function ButtonLink({ href, variant, size, children, isExternal = false }: ButtonLinkProps) {
  if (isExternal) return <a href={href} className={getButtonClasses(variant, size)}>{children}</a>;
  return <Link href={href} className={getButtonClasses(variant, size)}>{children}</Link>;
}

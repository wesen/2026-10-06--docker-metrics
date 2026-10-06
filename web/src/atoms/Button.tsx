import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "ghost" | "run" | "stop" | "sm" | "sm-ghost";

export function Button({ variant = "default", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls = ["btn", variant === "sm" || variant === "sm-ghost" ? "sm" : "", variant === "ghost" || variant === "sm-ghost" ? "ghost" : "", variant === "run" ? "run" : "", variant === "stop" ? "stop" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...rest} />;
}

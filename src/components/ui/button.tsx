import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "ghost"; size?: "default" | "sm" }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", size = "default", ...props }, ref) => (
  <button ref={ref} className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", variant === "primary" && "bg-blue-700 text-white hover:bg-blue-800", variant === "secondary" && "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50", variant === "ghost" && "text-slate-600 hover:bg-slate-100", size === "default" ? "h-11 px-5" : "h-9 px-3 text-sm", className)} {...props} />
));
Button.displayName = "Button";

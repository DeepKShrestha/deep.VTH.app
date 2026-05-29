import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "shadcn-card rounded-xl border bg-card border-card-border text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  // Padding:
  //   - Mobile (<sm): `p-4` (16px) — already tight enough for phones.
  //   - Desktop (sm+): `p-5` (20px) — previously `p-6` (24px). The looser
  //     desktop padding made forms feel airy: a register page with ~10
  //     section cards lost ~80px of vertical space to header padding alone.
  //     `p-5` keeps cards visually grouped without being cramped.
  // Callers passing an explicit `p-*` in `className` still override this.
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4 sm:p-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  // Matches `CardHeader` desktop tightening (`sm:p-5` rather than `sm:p-6`).
  // See `CardHeader` for rationale.
  <div ref={ref} className={cn("p-4 sm:p-5 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

export {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
}

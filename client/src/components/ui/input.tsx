import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Touch-target sizing:
    //   - Mobile (<md): `min-h-11` → 44px, matches iOS/Material accessibility
    //     guidance so fields don't feel cramped on phones and tablets.
    //   - Desktop (md+): `min-h-9` → 36px, preserves the previous dense layout.
    // `min-h-*` is used (not `h-*`) so callers passing `h-11` (e.g. quick
    // register mode) still take effect, and so taller inputs (e.g. ones with
    // textarea-like content) can grow naturally.
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-11 md:min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

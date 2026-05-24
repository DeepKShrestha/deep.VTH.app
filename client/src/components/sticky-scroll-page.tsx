import type { ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type StickyScrollPageProps = {
  /** Sticks to the top of the viewport while the document scrolls. */
  sticky: ReactNode;
  children: ReactNode;
  /** Extra classes on the outer container (e.g. min-height). */
  className?: string;
  stickyClassName?: string;
  bodyClassName?: string;
  /** Max width utility for the content column (default matches most forms/lists). */
  maxWidthClass?: string;
  /** Vertical padding on the outer shell (default py-6; hub/settings often use py-8). */
  contentPaddingClass?: string;
};

/**
 * Page shell: `sticky` stays at the top of the viewport while the document scrolls.
 * Use for long lists or forms so navigation, titles, and toolbars remain visible.
 *
 * For sticky behavior, the scrolling ancestor should be the document (or an ancestor
 * without a conflicting `overflow` clip). Inner panels that scroll should use their own
 * `thead.sticky` / toolbars inside that scroll container.
 */
export const StickyScrollPage = forwardRef<HTMLDivElement, StickyScrollPageProps>(
  function StickyScrollPage(
    {
      sticky,
      children,
      className,
      stickyClassName,
      bodyClassName,
      maxWidthClass = "max-w-4xl",
      contentPaddingClass = "py-6",
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(maxWidthClass, "mx-auto px-4", contentPaddingClass, className)}
      >
        <div
          className={cn(
            "sticky top-0 z-30 -mx-4 px-4 pb-3 mb-1 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 shadow-sm",
            stickyClassName,
          )}
        >
          {sticky}
        </div>
        <div className={cn("min-w-0", bodyClassName)}>{children}</div>
      </div>
    );
  },
);

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
    // Mobile-first gutters: `px-3` (12px) on phones, `px-4` (16px) at `sm+`.
    // Saves ~8px usable width on every page — material on a 360px screen
    // where each px counts. Sticky bar matches with `-mx-3 px-3 sm:-mx-4
    // sm:px-4` so it still bleeds edge-to-edge inside the column. Vertical
    // sticky padding also tightens (`pb-2 sm:pb-3`).
    return (
      <div
        ref={ref}
        className={cn(maxWidthClass, "mx-auto px-3 sm:px-4", contentPaddingClass, className)}
      >
        <div
          className={cn(
            "sticky top-0 z-30 -mx-3 px-3 sm:-mx-4 sm:px-4 pb-2 sm:pb-3 mb-1 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 shadow-sm",
            // When a caller opts into a max-height (e.g. case-list caps the
            // sticky bar at ~40vh on mobile so it doesn't push cases off-
            // screen), the inner overflow paints a scrollbar lane. Always
            // hide that visual lane — the area still scrolls, just no bar.
            "scrollbar-none",
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

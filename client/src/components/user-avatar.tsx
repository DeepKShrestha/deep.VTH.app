import { User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  /**
   * Time-limited signed URL (`SafeUser.profilePhotoUrl`). When null/empty
   * we fall back to initials, then to the generic person icon.
   */
  photoUrl?: string | null;
  /**
   * Full name used to derive a 1–2 letter monogram fallback. We prefer
   * showing initials over the generic icon because they're more personal
   * and immediately distinguishable in multi-user contexts.
   */
  name?: string | null;
  /**
   * Pixel size of the round avatar. Defaults to 32 (`h-8 w-8`) which is the
   * common toolbar size. Use 48 for the mobile hero card, 56 for profile.
   */
  size?: number;
  /**
   * Tone preset. `tinted` uses the primary accent (current behaviour in the
   * welcome mobile card and profile page); `muted` is a neutral grey ring
   * suitable for the desktop toolbar where it should sit quietly.
   */
  tone?: "tinted" | "muted";
  /** Optional extra classes for the outer container. */
  className?: string;
};

function deriveInitials(name?: string | null): string {
  if (!name) return "";
  const cleaned = name.trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  const first = parts[0]!.slice(0, 1);
  const last = parts[parts.length - 1]!.slice(0, 1);
  return (first + last).toUpperCase();
}

/**
 * Round profile avatar with a 3-tier fallback chain:
 *   1. Uploaded photo (`profilePhotoUrl`)
 *   2. Derived initials from full name
 *   3. Generic person icon
 *
 * Why a dedicated component instead of inlining: we render the avatar in 4
 * places (welcome mobile card, welcome desktop toolbar, profile header, and
 * the welcome Profile button) — without this, swapping the fallback chain
 * or photo URL renewal logic would require touching all four call sites.
 *
 * The `<img>` falls back to the initials block via an `onError` handler so
 * a 404 (e.g. signed URL expired) doesn't show a broken-image glyph; it
 * just degrades to the initials.
 */
export function UserAvatar({
  photoUrl,
  name,
  size = 32,
  tone = "tinted",
  className,
}: UserAvatarProps) {
  const initials = deriveInitials(name);
  const dim = { width: size, height: size };
  const fontSize = Math.max(10, Math.round(size * 0.4));

  const baseClasses = cn(
    "relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0",
    tone === "tinted"
      ? "bg-primary/10 ring-2 ring-primary/15 text-primary"
      : "bg-muted ring-1 ring-border text-muted-foreground",
    className,
  );

  if (photoUrl) {
    return (
      <span className={baseClasses} style={dim} aria-hidden>
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(event) => {
            // Hide the broken <img> so the fallback layer below shows.
            event.currentTarget.style.display = "none";
          }}
        />
        {/* Initials/icon layer sits behind the img and only becomes
            visible if the img fails to load (display:none above). */}
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold"
          style={{ fontSize }}
        >
          {initials || (
            <UserIcon
              style={{ width: size * 0.55, height: size * 0.55 }}
              aria-hidden
            />
          )}
        </span>
      </span>
    );
  }

  return (
    <span className={baseClasses} style={dim} aria-hidden>
      {initials ? (
        <span className="font-semibold" style={{ fontSize }}>
          {initials}
        </span>
      ) : (
        <UserIcon
          style={{ width: size * 0.55, height: size * 0.55 }}
          aria-hidden
        />
      )}
    </span>
  );
}

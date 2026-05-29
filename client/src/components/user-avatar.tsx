import { useEffect, useState } from "react";
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
 * Round profile avatar with a strict fallback chain:
 *   1. Uploaded photo (`profilePhotoUrl`) — when loaded, NOTHING is
 *      rendered on top of it (no initials, no icon overlay). The previous
 *      revision stacked the initials layer behind the `<img>` and relied on
 *      `onError` to expose them, but transparent or partially-failed images
 *      let the initials bleed through (see screenshot bug where "DS" sat on
 *      the user's face). We now ONLY render the `<img>` when there's a
 *      photo URL, and only swap in the initials block once `onError` fires.
 *   2. Derived initials from full name.
 *   3. Generic person icon.
 *
 * Why a dedicated component instead of inlining: we render the avatar in
 * three places (welcome mobile card, welcome desktop toolbar, profile page
 * header). Without this, swapping the fallback chain or photo-URL renewal
 * logic would require touching all three call sites.
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

  // Track image load failure so we can fall back to initials/icon WITHOUT
  // stacking a hidden layer behind a transparent image. Reset whenever the
  // src changes (e.g. user re-uploads a photo and the signed URL changes).
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);

  const baseClasses = cn(
    "relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0",
    tone === "tinted"
      ? "bg-primary/10 ring-2 ring-primary/15 text-primary"
      : "bg-muted ring-1 ring-border text-muted-foreground",
    className,
  );

  const showPhoto = Boolean(photoUrl) && !imgFailed;

  if (showPhoto) {
    return (
      <span className={baseClasses} style={dim} aria-hidden>
        <img
          src={photoUrl ?? undefined}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={baseClasses} style={dim} aria-hidden>
      {initials ? (
        <span className="font-semibold leading-none" style={{ fontSize }}>
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

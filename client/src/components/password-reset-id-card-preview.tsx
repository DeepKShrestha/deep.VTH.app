import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type Props = {
  requestId: number;
  hasIdCard: boolean;
  status: string;
};

export function PasswordResetIdCardPreview({ requestId, hasIdCard, status }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (status !== "pending" || !hasIdCard) {
      setThumbUrl(null);
      setLoadError(false);
      return;
    }

    let revoked: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/admin/password-reset-requests/${requestId}/id-card`,
          { credentials: "same-origin" },
        );
        if (!res.ok) {
          if (!cancelled) setLoadError(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setThumbUrl(revoked);
        setLoadError(false);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [requestId, hasIdCard, status]);

  if (status !== "pending" || !hasIdCard) return null;

  if (loadError) {
    return (
      <p className="text-xs text-destructive mt-2">
        University ID card image could not be loaded.
      </p>
    );
  }

  if (!thumbUrl) {
    return (
      <p className="text-xs text-muted-foreground mt-2">Loading university ID card…</p>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">University ID card</p>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="block rounded-md border border-border overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="View university ID card full size"
          >
            <img
              src={thumbUrl}
              alt="University ID card"
              className="h-24 w-auto max-w-full object-contain bg-muted/30"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>University ID card</DialogTitle>
          </DialogHeader>
          <img
            src={thumbUrl}
            alt="University ID card"
            className="w-full max-h-[70vh] object-contain rounded-md"
          />
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
      <p className="text-xs text-muted-foreground">Click the image to enlarge.</p>
    </div>
  );
}

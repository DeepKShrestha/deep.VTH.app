import { useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf";
import { hydrateToggleDefaultsFromServer } from "@/lib/module-toggle-defaults";

type PrefsField = "astToggleDefaults" | "hospitalToggleDefaults";

interface UseModuleToggleDefaultsOptions<T> {
  /** Which preferences field this module persists to on the server. */
  field: PrefsField;
  /** Reads the current local defaults (after hydration). */
  getDefaults: () => T;
  /** Writes defaults to the local store (called on every change). */
  setDefaults: (value: T) => void;
}

interface UseModuleToggleDefaultsResult<T> {
  toggleDefaults: T;
  setToggleDefaults: React.Dispatch<React.SetStateAction<T>>;
  /** Briefly true after a successful (non-initial) save, for a "saved" banner. */
  prefsSavedBanner: boolean;
  /** Collapsible panel open state + ref for click-outside-to-close. */
  toggleOpen: boolean;
  setToggleOpen: React.Dispatch<React.SetStateAction<boolean>>;
  togglePanelRef: React.RefObject<HTMLDivElement>;
}

/**
 * Shared logic behind the AST and Hospital settings pages' "Register Form
 * Toggle Defaults" panel: hydrate defaults from the server on mount, persist
 * them (debounced) on change with CSRF, show a transient "saved" banner, and
 * manage the collapsible panel's open/click-outside state.
 *
 * The two pages differ only in their toggle UI and which preferences field
 * they target; everything stateful lives here.
 */
export function useModuleToggleDefaults<T>(
  options: UseModuleToggleDefaultsOptions<T>,
): UseModuleToggleDefaultsResult<T> {
  const { field, getDefaults, setDefaults } = options;
  const skipFirstPrefsSavedBanner = useRef(true);
  const [prefsSavedBanner, setPrefsSavedBanner] = useState(false);
  const [toggleDefaults, setToggleDefaults] = useState<T>(getDefaults());
  const [toggleOpen, setToggleOpen] = useState(false);
  const togglePanelRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from the server once on mount.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/users/me/preferences", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const p = (await res.json()) as {
          astToggleDefaults: Record<string, unknown> | null;
          hospitalToggleDefaults: Record<string, unknown> | null;
        };
        hydrateToggleDefaultsFromServer({
          astToggleDefaults: p.astToggleDefaults,
          hospitalToggleDefaults: p.hospitalToggleDefaults,
        });
        setToggleDefaults(getDefaults());
      } catch {
        /* ignore offline / unauthenticated errors */
      }
    })();
    // Run once; getDefaults is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist (debounced) on every change.
  useEffect(() => {
    setDefaults(toggleDefaults);
    const tmr = window.setTimeout(() => {
      void fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ [field]: toggleDefaults }),
        credentials: "same-origin",
      })
        .then((res) => {
          if (!res.ok) return;
          if (skipFirstPrefsSavedBanner.current) {
            skipFirstPrefsSavedBanner.current = false;
            return;
          }
          setPrefsSavedBanner(true);
          window.setTimeout(() => setPrefsSavedBanner(false), 2200);
        })
        .catch(() => {});
    }, 700);
    return () => window.clearTimeout(tmr);
    // setDefaults/field are stable; re-run only when the values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleDefaults]);

  // Close the collapsible panel when clicking outside it.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!togglePanelRef.current) return;
      if (!togglePanelRef.current.contains(event.target as Node)) {
        setToggleOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return {
    toggleDefaults,
    setToggleDefaults,
    prefsSavedBanner,
    toggleOpen,
    setToggleOpen,
    togglePanelRef,
  };
}

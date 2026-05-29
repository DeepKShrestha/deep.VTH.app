import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

/**
 * Notification sound styles.
 *
 * Mirror of the union in `welcome.tsx`. We duplicate the literal here so this
 * file has no client→client UI dep — the Welcome page still owns the user-
 * facing prefs UI; this component only consumes those prefs from localStorage
 * to fire toasts + sounds globally (i.e. on EVERY route, not just `/`).
 *
 * Why duplicate the union: extracting it to a shared module would force a
 * tree-shake import chain through `welcome.tsx` and pull in microphone-y
 * deps for any page that mounts `<AdminNotificationCenter />` (which is all
 * authenticated pages). The literal is small and stable.
 */
type NotificationSoundStyle =
  | "chime"
  | "ding"
  | "pulse"
  | "studio-confirm"
  | "ui-back"
  | "ui-start"
  | "ui-start-alt"
  | "correct-answer"
  | "notif-real"
  | "digital-quick";

const SOUND_FILE_BY_STYLE: Partial<Record<NotificationSoundStyle, string>> = {
  "studio-confirm": "/sounds/confirm_tone.wav",
  "ui-back": "/sounds/interface_back.wav",
  "ui-start": "/sounds/interface_start.wav",
  "ui-start-alt": "/sounds/interface_start_alt.wav",
  "correct-answer": "/sounds/correct_answer.wav",
  "notif-real": "/sounds/new_notification_09.mp3",
  "digital-quick": "/sounds/digital_quick.wav",
};

function playNotificationSound(style: NotificationSoundStyle, volume: number) {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  const externalSound = SOUND_FILE_BY_STYLE[style];
  if (externalSound) {
    try {
      const audio = new Audio(externalSound);
      audio.volume = clampedVolume;
      void audio.play().catch((err) => {
        // Surface failures to the dev console so we can tell autoplay-block
        // vs missing-asset apart. Browser autoplay policy commonly blocks
        // audio until the user has interacted with the page; once any click
        // has happened in this tab subsequent plays succeed.
        // eslint-disable-next-line no-console
        console.warn(
          "[notifications] audio.play() rejected — usually browser autoplay block. Click anywhere in the page once and try again.",
          err,
        );
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[notifications] failed to construct Audio element", err);
    }
    return;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(0.85, 0.1 + clampedVolume * 0.55);
    gain.connect(audioCtx.destination);

    const addTone = (type: OscillatorType, freq: number, start: number, end: number) => {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + end);
    };

    const schedule = () => {
      if (style === "ding") {
        addTone("sine", 1174, 0, 0.14); // D6
        return;
      }
      if (style === "pulse") {
        addTone("square", 880, 0, 0.06);
        addTone("square", 988, 0.1, 0.17);
        addTone("square", 1046, 0.2, 0.3);
        return;
      }
      // default: chime
      addTone("triangle", 1046, 0, 0.09); // C6
      addTone("sine", 1318, 0.1, 0.22); // E6
    };

    void audioCtx
      .resume()
      .then(schedule)
      .catch(() => {
        schedule();
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notifications] WebAudio fallback failed", err);
  }
}

type NotificationItem = {
  key: string;
  type: "pending-approval" | "download-request" | "password-reset";
  title: string;
  message: string;
  href: string;
  createdAt: string;
  isRead: boolean;
};

type NotificationsResponse = { items: NotificationItem[]; unreadCount: number };

/**
 * Read the per-user notification prefs from localStorage. Defaults are set
 * here so they apply on ALL pages, not just the Welcome page where the
 * dropdown is rendered.
 *
 * Important: sound alerts default to ON for admins. Historically this
 * defaulted to OFF and was buried behind a "settings cog" inside the bell
 * dropdown, so admins reported "I never hear notifications" — they simply
 * never discovered the toggle. The toggle still lives in the Welcome bell
 * UI; this just makes the un-set state behave as "on".
 */
function readPrefs(userId: number) {
  const key = String(userId);
  const toastRaw = window.localStorage.getItem(`vth:notifications:toast:${key}`);
  const soundRaw = window.localStorage.getItem(`vth:notifications:sound:${key}`);
  const styleRaw = window.localStorage.getItem(`vth:notifications:sound-style:${key}`);
  const volumeRaw = window.localStorage.getItem(`vth:notifications:sound-volume:${key}`);

  const validStyles: NotificationSoundStyle[] = [
    "chime",
    "ding",
    "pulse",
    "studio-confirm",
    "ui-back",
    "ui-start",
    "ui-start-alt",
    "correct-answer",
    "notif-real",
    "digital-quick",
  ];
  const style: NotificationSoundStyle =
    styleRaw && validStyles.includes(styleRaw as NotificationSoundStyle)
      ? (styleRaw as NotificationSoundStyle)
      : "chime";
  const volume = Number(volumeRaw);

  return {
    // Toast: ON unless explicitly disabled ("0").
    enableToastAlerts: toastRaw !== "0",
    // Sound: ON unless explicitly disabled ("0"). Previously this read
    // `=== "1"` which silently defaulted OFF.
    enableSoundAlerts: soundRaw !== "0",
    soundStyle: style,
    soundVolume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.7,
  };
}

/**
 * Invisible component mounted once at the app shell for any authenticated
 * admin user. Polls `/api/admin/notifications` every 30s while the tab is
 * visible and fires a toast + sound whenever a NEW unread item appears.
 *
 * Why this exists as a separate component (rather than living in
 * `welcome.tsx`): the previous polling lived in Welcome, so an admin who
 * left `/` (e.g. went to the admin panel, hospital module, or any other
 * page) silently lost notifications. Mounting this once at the app shell
 * gives them sound + toast everywhere.
 *
 * React Query dedupes by `queryKey`, so the Welcome bell dropdown's own
 * `useQuery(["/api/admin/notifications"])` shares cache with this one
 * instead of doubling the request load.
 */
export function AdminNotificationCenter() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const previousUnreadKeysRef = useRef<Set<string> | null>(null);
  const [prefsVersion, setPrefsVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setPrefsVersion((v) => v + 1);
    window.addEventListener("vth:notification-prefs-hydrated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("vth:notification-prefs-hydrated", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const { data: notificationsData } = useQuery<NotificationsResponse>({
    queryKey: ["/api/admin/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/notifications");
      return res.json();
    },
    enabled: Boolean(isAdmin && user?.id),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? false
        : 30000,
  });

  useEffect(() => {
    if (!isAdmin || !user?.id || !notificationsData) return;

    const unreadKeys = new Set(
      notificationsData.items.filter((item) => !item.isRead).map((item) => item.key),
    );
    const prev = previousUnreadKeysRef.current;
    previousUnreadKeysRef.current = unreadKeys;
    if (!prev) return; // first poll: don't notify retroactively

    let newItems = 0;
    unreadKeys.forEach((key) => {
      if (!prev.has(key)) newItems += 1;
    });
    if (newItems <= 0) return;

    const prefs = readPrefs(user.id);
    if (prefs.enableToastAlerts) {
      toast({
        title: "New admin notifications",
        description: `${newItems} new request${newItems > 1 ? "s" : ""} waiting for review.`,
      });
    }
    if (prefs.enableSoundAlerts) {
      playNotificationSound(prefs.soundStyle, prefs.soundVolume);
    }
    // `prefsVersion` is in deps so hydrate events (login on another device
    // syncs prefs to this tab) re-read fresh prefs on the next poll.
  }, [isAdmin, user?.id, notificationsData, toast, prefsVersion]);

  return null;
}

export { playNotificationSound };
export type { NotificationSoundStyle };

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiRequestForm, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth";
import { Database, Download, Loader2, Upload } from "lucide-react";

const CONFIRM_PHRASE = "RESTORE_SITE_DATA";

const INTERVAL_PRESETS = [1, 2, 3, 6, 12, 24, 48, 168];
const RETENTION_PRESETS = [3, 5, 7, 14, 30, 60];

type BackupSettingsResponse = {
  autoBackupEnabled: boolean;
  autoIntervalHours: number;
  retentionCount: number;
  remoteUploadEnabled: boolean;
  dbProvider: string;
  s3Configured: boolean;
};

type LocalBackupFile = {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
};

type BackupHistoryRow = {
  id: number;
  created_at: string;
  kind: string;
  status: string;
  filename: string;
  size_bytes: number;
  error_message: string | null;
  remote_key: string | null;
  db_provider: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBackupFile(filename: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`/api/admin/backup/download/${encodeURIComponent(filename)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminSiteBackupPanel() {
  const { toast } = useToast();
  const [restorePhrase, setRestorePhrase] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<BackupSettingsResponse>({
    queryKey: ["/api/admin/backup/settings"],
  });
  const { data: localFiles = [], isLoading: filesLoading } = useQuery<LocalBackupFile[]>({
    queryKey: ["/api/admin/backup/local-files"],
  });
  const { data: history = [], isLoading: historyLoading } = useQuery<BackupHistoryRow[]>({
    queryKey: ["/api/admin/backup/history"],
  });

  const runBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backup/run");
      return res.json() as Promise<{ filename: string; sizeBytes: number; remoteKey: string | null }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Backup created",
        description: `${data.filename} (${formatBytes(data.sizeBytes)})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/local-files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/history"] });
    },
    onError: (e: Error) => {
      toast({ title: "Backup failed", description: e.message, variant: "destructive" });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (patch: Partial<BackupSettingsResponse>) => {
      const res = await apiRequest("PUT", "/api/admin/backup/settings", patch);
      return res.json() as Promise<BackupSettingsResponse>;
    },
    onSuccess: () => {
      toast({ title: "Backup settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/settings"] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not save settings", description: e.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!restoreFile) throw new Error("Choose a backup zip file.");
      const fd = new FormData();
      fd.append("archive", restoreFile);
      fd.append("confirmPhrase", restorePhrase.trim());
      const res = await apiRequestForm("POST", "/api/admin/backup/restore", fd);
      return res.json() as Promise<{ detail: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Restore completed",
        description: data.detail || "Restart the app if needed.",
      });
      setRestorePhrase("");
      setRestoreFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/history"] });
    },
    onError: (e: Error) => {
      toast({ title: "Restore failed", description: e.message, variant: "destructive" });
    },
  });

  const remoteBlocked =
    settings && settings.remoteUploadEnabled && !settings.s3Configured;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            Site backup & restore
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Full-site zip with database ({settings?.dbProvider ?? "…"}) and uploaded case files.
            Only superadmins can use these actions.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => runBackupMutation.mutate()}
              disabled={runBackupMutation.isPending}
              className="gap-1.5"
            >
              {runBackupMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              Run backup now
            </Button>
          </div>

          <div className="rounded-md border divide-y">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              Local backup files
            </div>
            {filesLoading ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : localFiles.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No backups yet.</p>
            ) : (
              <ul className="max-h-48 overflow-auto">
                {localFiles.map((f) => (
                  <li
                    key={f.filename}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs truncate flex-1 min-w-0">{f.filename}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatBytes(f.sizeBytes)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        downloadBackupFile(f.filename).catch((e: Error) =>
                          toast({
                            title: "Download failed",
                            description: e.message,
                            variant: "destructive",
                          }),
                        )
                      }
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border divide-y">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
              Recent backup runs
            </div>
            {historyLoading ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="max-h-56 overflow-auto">
                {history.slice(0, 50).map((h) => (
                  <li key={h.id} className="px-3 py-2 text-xs border-b last:border-0">
                    <div className="flex flex-wrap justify-between gap-1">
                      <span className="font-medium">{h.kind}</span>
                      <span
                        className={
                          h.status === "success"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }
                      >
                        {h.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {new Date(h.created_at).toLocaleString()} · {h.db_provider}
                    </div>
                    {h.filename ? (
                      <div className="font-mono truncate mt-0.5">{h.filename}</div>
                    ) : null}
                    {h.error_message ? (
                      <div className="text-destructive mt-1 whitespace-pre-wrap">{h.error_message}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Automatic backups</CardTitle>
          <p className="text-xs text-muted-foreground">
            Runs on a timer while the server process is up (minimum every hour). Interval is read from
            settings each cycle.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading || !settings ? (
            <p className="text-sm text-muted-foreground">Loading settings…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 rounded border px-3 py-2">
                <div>
                  <Label htmlFor="auto-backup-enabled" className="text-sm">
                    Enable scheduled backups
                  </Label>
                  <p className="text-xs text-muted-foreground">Creates a zip on each interval.</p>
                </div>
                <Switch
                  id="auto-backup-enabled"
                  checked={settings.autoBackupEnabled}
                  onCheckedChange={(v) => settingsMutation.mutate({ autoBackupEnabled: v })}
                  disabled={settingsMutation.isPending}
                />
              </div>

              <div className="grid gap-2 max-w-xs">
                <Label className="text-xs">Interval (hours)</Label>
                <Select
                  value={String(settings.autoIntervalHours)}
                  onValueChange={(v) =>
                    settingsMutation.mutate({ autoIntervalHours: Number.parseInt(v, 10) })
                  }
                  disabled={settingsMutation.isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!INTERVAL_PRESETS.includes(settings.autoIntervalHours) && (
                      <SelectItem value={String(settings.autoIntervalHours)}>
                        {settings.autoIntervalHours} hours (current)
                      </SelectItem>
                    )}
                    {INTERVAL_PRESETS.map((h) => (
                      <SelectItem key={h} value={String(h)}>
                        {h === 168 ? "Weekly (168h)" : `${h} hour${h === 1 ? "" : "s"}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 max-w-xs">
                <Label className="text-xs">Keep last N local zips</Label>
                <Select
                  value={String(settings.retentionCount)}
                  onValueChange={(v) =>
                    settingsMutation.mutate({ retentionCount: Number.parseInt(v, 10) })
                  }
                  disabled={settingsMutation.isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!RETENTION_PRESETS.includes(settings.retentionCount) && (
                      <SelectItem value={String(settings.retentionCount)}>
                        {settings.retentionCount} backups (current)
                      </SelectItem>
                    )}
                    {RETENTION_PRESETS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} backups
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-4 rounded border px-3 py-2">
                <div>
                  <Label htmlFor="remote-upload" className="text-sm">
                    Upload to S3 after local save
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Requires{" "}
                    <code className="text-[11px]">BACKUP_S3_BUCKET</code>,{" "}
                    <code className="text-[11px]">AWS_ACCESS_KEY_ID</code>,{" "}
                    <code className="text-[11px]">AWS_SECRET_ACCESS_KEY</code>
                    {settings.s3Configured ? (
                      <span className="text-emerald-600 dark:text-emerald-400"> · configured</span>
                    ) : (
                      <span> · not configured on server</span>
                    )}
                  </p>
                </div>
                <Switch
                  id="remote-upload"
                  checked={settings.remoteUploadEnabled}
                  onCheckedChange={(v) => settingsMutation.mutate({ remoteUploadEnabled: v })}
                  disabled={settingsMutation.isPending}
                />
              </div>
              {remoteBlocked ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Remote upload is on but S3 env is incomplete; uploads will fail until configured.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive">Restore from zip</CardTitle>
          <p className="text-xs text-muted-foreground">
            Replaces the live database and attachment files with the archive contents. Type{" "}
            <code className="font-mono">{CONFIRM_PHRASE}</code> exactly to proceed.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="restore-file">Backup zip</Label>
            <Input
              id="restore-file"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="restore-phrase">Confirmation phrase</Label>
            <Input
              id="restore-phrase"
              value={restorePhrase}
              onChange={(e) => setRestorePhrase(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={restoreMutation.isPending}
            onClick={() => restoreMutation.mutate()}
          >
            {restoreMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Restore site data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

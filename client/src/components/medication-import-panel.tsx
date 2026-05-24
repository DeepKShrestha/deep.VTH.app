import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequestForm, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DryRunResponse = {
  dryRun: true;
  fileErrors: Array<{ row: number; message: string }>;
  parseErrors: Array<{ row: number; message: string }>;
  consolidatedDuplicateRows: number;
  rowCount: number;
  wouldCreate: number;
  wouldUpdate: number;
  wouldSkip: number;
  sample: Array<{ rowNumber: number; name: string; medicationClass: string | null }>;
};

type ImportResponse = {
  dryRun: false;
  created: number;
  updated: number;
  skipped: number;
  fileErrors: Array<{ row: number; message: string }>;
  parseErrors: Array<{ row: number; message: string }>;
  consolidatedDuplicateRows: number;
  applyErrors: Array<{ row: number; message: string }>;
};

export function MedicationImportPanel() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [preview, setPreview] = useState<DryRunResponse | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const lastFileRef = useRef<File | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (input: { file: File; onDuplicate: "skip" | "update" }) => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("dryRun", "true");
      fd.append("onDuplicate", input.onDuplicate);
      const res = await apiRequestForm("POST", "/api/admin/medications/bulk-import", fd);
      return res.json() as Promise<DryRunResponse>;
    },
    onSuccess: (data) => {
      setPreview(data);
    },
    onError: (e: unknown) => {
      setPreview(null);
      toast({
        title: "Preview failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (input: { file: File; onDuplicate: "skip" | "update" }) => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("dryRun", "false");
      fd.append("onDuplicate", input.onDuplicate);
      const res = await apiRequestForm("POST", "/api/admin/medications/bulk-import", fd);
      return res.json() as Promise<ImportResponse>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/medications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/medications"] });
      setPreview(null);
      setLastFile(null);
      lastFileRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
      toast({
        title: "Import complete",
        description: `Created ${data.created}, updated ${data.updated}, skipped ${data.skipped}.`,
      });
      if (data.applyErrors.length > 0) {
        toast({
          title: "Some rows failed",
          description: `${data.applyErrors.length} error(s). Check server logs or re-import failed rows.`,
          variant: "destructive",
        });
      }
    },
    onError: (e: unknown) => {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const onFileChosen = (file: File | null) => {
    if (!file) return;
    setLastFile(file);
    lastFileRef.current = file;
    previewMutation.mutate({ file, onDuplicate });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Bulk import (CSV or Excel)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Two columns: medication name and therapeutic class (e.g. Ceftriaxone, Antibiotic). Optional header
          row with labels like <span className="font-medium">name</span> and{" "}
          <span className="font-medium">class</span> or <span className="font-medium">group</span>. Maximum
          3,000 rows; .csv and .xlsx only.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">When name already exists</Label>
            <Select
              value={onDuplicate}
              onValueChange={(v) => {
                const next = v as "skip" | "update";
                setOnDuplicate(next);
                const f = lastFileRef.current;
                if (f) {
                  previewMutation.mutate({ file: f, onDuplicate: next });
                }
              }}
            >
              <SelectTrigger className="h-9 w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip existing (keep current class)</SelectItem>
                <SelectItem value="update">Update class from file</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2 shrink-0"
            onClick={() => inputRef.current?.click()}
            disabled={previewMutation.isPending || importMutation.isPending}
          >
            {previewMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Choose file…
          </Button>
        </div>

        {preview && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            <p className="font-medium">Preview</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Rows after de-duplication (by name, case-insensitive): {preview.rowCount}</li>
              <li>Would create: {preview.wouldCreate}</li>
              <li>Would update: {preview.wouldUpdate}</li>
              <li>Would skip: {preview.wouldSkip}</li>
              {preview.consolidatedDuplicateRows > 0 && (
                <li>Duplicate names in file (last row wins): {preview.consolidatedDuplicateRows}</li>
              )}
            </ul>
            {preview.fileErrors.length > 0 && (
              <div className="text-xs text-destructive space-y-1">
                {preview.fileErrors.map((err) => (
                  <p key={`f-${err.message}`}>{err.message}</p>
                ))}
              </div>
            )}
            {preview.parseErrors.length > 0 && (
              <div className="text-xs text-destructive max-h-24 overflow-y-auto space-y-0.5">
                {preview.parseErrors.slice(0, 15).map((err) => (
                  <p key={`${err.row}-${err.message}`}>
                    Row {err.row}: {err.message}
                  </p>
                ))}
                {preview.parseErrors.length > 15 && (
                  <p>…and {preview.parseErrors.length - 15} more</p>
                )}
              </div>
            )}
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto max-h-40 overflow-y-auto rounded border bg-background">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r) => (
                      <tr key={`${r.rowNumber}-${r.name}`} className="border-b last:border-b-0">
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-muted-foreground">{r.medicationClass ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!lastFile || importMutation.isPending || preview.rowCount === 0}
                onClick={() => lastFile && importMutation.mutate({ file: lastFile, onDuplicate })}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Importing…
                  </>
                ) : (
                  "Apply import"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setLastFile(null);
                  lastFileRef.current = null;
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Clear preview
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

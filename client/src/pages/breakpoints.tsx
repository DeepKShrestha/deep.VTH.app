import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Breakpoint } from "@shared/schema";
import {
  parseAstResultsCsv,
  PENDING_AST_CSV_IMPORT_KEY,
  type PendingAstCsvImportPayload,
} from "@/lib/ast-csv-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, RotateCcw, Upload } from "lucide-react";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

export default function BreakpointsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: breakpointsData } = useQuery<Breakpoint[]>({ queryKey: ["/api/breakpoints"] });

  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportText, setCsvImportText] = useState("");
  const [csvImportMode, setCsvImportMode] = useState<"replace" | "append">("replace");
  const [csvImportReport, setCsvImportReport] = useState<{
    parsed: number;
    matched: number;
    unmatched: string[];
  } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingBp, setEditingBp] = useState<Breakpoint | null>(null);
  const [form, setForm] = useState({ antibiotic: "", symbol: "", content: "", sensitiveMin: "", intermediateLow: "", intermediateHigh: "", resistantMax: "", primaryTargets: "" });

  const openAdd = () => {
    setEditingBp(null);
    setForm({ antibiotic: "", symbol: "", content: "", sensitiveMin: "", intermediateLow: "", intermediateHigh: "", resistantMax: "", primaryTargets: "" });
    setEditOpen(true);
  };

  const openEdit = (bp: Breakpoint) => {
    setEditingBp(bp);
    setForm({
      antibiotic: bp.antibiotic,
      symbol: bp.symbol,
      content: bp.content,
      sensitiveMin: String(bp.sensitiveMin),
      intermediateLow: bp.intermediateLow != null ? String(bp.intermediateLow) : "",
      intermediateHigh: bp.intermediateHigh != null ? String(bp.intermediateHigh) : "",
      resistantMax: String(bp.resistantMax),
      primaryTargets: bp.primaryTargets || "",
    });
    setEditOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        antibiotic: form.antibiotic,
        symbol: form.symbol,
        content: form.content,
        sensitiveMin: parseInt(form.sensitiveMin),
        intermediateLow: form.intermediateLow ? parseInt(form.intermediateLow) : null,
        intermediateHigh: form.intermediateHigh ? parseInt(form.intermediateHigh) : null,
        resistantMax: parseInt(form.resistantMax),
        primaryTargets: form.primaryTargets || null,
      };
      if (editingBp) {
        await apiRequest("PATCH", `/api/breakpoints/${editingBp.id}`, body);
      } else {
        await apiRequest("POST", "/api/breakpoints", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakpoints"] });
      setEditOpen(false);
      toast({ title: editingBp ? "Breakpoint updated" : "Breakpoint added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/breakpoints/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakpoints"] });
      toast({ title: "Breakpoint deleted" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/breakpoints/reset"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakpoints"] });
      toast({ title: "Breakpoints reset to defaults" });
    },
  });

  const presetMutation = useMutation({
    mutationFn: async ({ id, isPreset }: { id: number; isPreset: boolean }) => {
      await apiRequest("PATCH", `/api/breakpoints/${id}/preset`, { isPreset });
    },
    onMutate: async ({ id, isPreset }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/breakpoints"] });
      const previous = queryClient.getQueryData<Breakpoint[]>(["/api/breakpoints"]);
      if (previous) {
        queryClient.setQueryData<Breakpoint[]>(
          ["/api/breakpoints"],
          previous.map((bp) => (bp.id === id ? { ...bp, isPreset } : bp)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/breakpoints"], context.previous);
      }
      toast({ title: "Failed to update preset", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Preset updated" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/breakpoints"] });
    },
  });

  const togglePreset = (bp: Breakpoint) => {
    presetMutation.mutate({ id: bp.id, isPreset: !bp.isPreset });
  };

  const stageCsvForRegisterCase = () => {
    const bps = breakpointsData ?? [];
    const result = parseAstResultsCsv(csvImportText, bps);
    setCsvImportReport({
      parsed: result.parsed,
      matched: result.matched,
      unmatched: result.unmatched,
    });
    if (result.rows.length === 0) {
      toast({
        title: "No AST rows to import",
        description: "Add a header row and at least one data row with antibiotic or symbol.",
        variant: "destructive",
      });
      return;
    }
    const payload: PendingAstCsvImportPayload = {
      version: 1,
      mode: csvImportMode,
      rows: result.rows,
      parsed: result.parsed,
      matched: result.matched,
      unmatched: result.unmatched,
    };
    try {
      sessionStorage.setItem(PENDING_AST_CSV_IMPORT_KEY, JSON.stringify(payload));
    } catch {
      toast({
        title: "Could not save import",
        description: "Your browser may block storage for this site.",
        variant: "destructive",
      });
      return;
    }
    setCsvImportOpen(false);
    setCsvImportText("");
    setCsvImportReport(null);
    setLocation("/register");
  };


  return (
    <StickyScrollPage
      maxWidthClass="max-w-5xl"
      bodyClassName="space-y-3 sm:space-y-4"
      sticky={
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/ast-report/settings"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-lg font-semibold">Breakpoint Data</h1>
              <p className="text-sm text-muted-foreground">Manage antibiotic zone diameter interpretive criteria</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setCsvImportReport(null);
                setCsvImportOpen(true);
              }}
              data-testid="button-import-ast-csv"
            >
              <Upload className="w-3.5 h-3.5" />
              Import from CSV
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Reset Defaults</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
                  <AlertDialogDescription>This will delete all custom entries and restore the original breakpoint data from the PDF.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMutation.mutate()}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" />Add Entry</Button>
          </div>
        </div>
      }
    >
      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[min(75vh,40rem)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium text-xs">Antibiotic</th>
                  <th className="text-left py-2 px-3 font-medium text-xs">Sym.</th>
                  <th className="text-left py-2 px-3 font-medium text-xs">Disc</th>
                  <th className="text-center py-2 px-3 font-medium text-xs text-emerald-600">S&ge;</th>
                  <th className="text-center py-2 px-3 font-medium text-xs text-amber-600">I (range)</th>
                  <th className="text-center py-2 px-3 font-medium text-xs text-red-600">R&le;</th>
                  <th className="text-left py-2 px-3 font-medium text-xs">Targets</th>
                  <th className="text-center py-2 px-3 font-medium text-xs">Preset</th>
    {/* Existing actions column */}
                  <th className="py-2 px-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
  {(breakpointsData || []).map((bp) => (
    <tr key={bp.id} className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="py-2 px-3 font-medium">{bp.antibiotic}</td>
      <td className="py-2 px-3 text-muted-foreground">{bp.symbol}</td>
      <td className="py-2 px-3 text-muted-foreground">{bp.content}</td>
      <td className="py-2 px-3 text-center text-emerald-700 dark:text-emerald-400 font-medium">
        {bp.sensitiveMin}
      </td>
      <td className="py-2 px-3 text-center text-amber-700 dark:text-amber-400">
        {bp.intermediateLow != null && bp.intermediateHigh != null
          ? `${bp.intermediateLow}–${bp.intermediateHigh}`
          : "—"}
      </td>
      <td className="py-2 px-3 text-center text-red-700 dark:text-red-400 font-medium">
        {bp.resistantMax}
      </td>
      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[180px] truncate">
        {bp.primaryTargets || "—"}
      </td>

      {/* NEW: Preset toggle cell */}
      <td className="py-2 px-3 text-center">
        <input
          type="checkbox"
          checked={bp.isPreset}
          onChange={() => togglePreset(bp)}
        />
      </td>

      {/* Existing actions cell */}
      <td className="py-2 px-3">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => openEdit(bp)}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate(bp.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </td>
    </tr>
  ))}
</tbody>

            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBp ? "Edit Breakpoint" : "Add Breakpoint"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Antibiotic Name</Label>
                <Input value={form.antibiotic} onChange={(e) => setForm({ ...form, antibiotic: e.target.value })} placeholder="e.g. Amoxicillin" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Symbol</Label>
                <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="e.g. AML" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Disc Content</Label>
              <Input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="e.g. 25 µg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-emerald-600">S &ge; (mm)</Label>
                <Input type="number" value={form.sensitiveMin} onChange={(e) => setForm({ ...form, sensitiveMin: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-amber-600">I Low</Label>
                <Input type="number" value={form.intermediateLow} onChange={(e) => setForm({ ...form, intermediateLow: e.target.value })} placeholder="opt" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-amber-600">I High</Label>
                <Input type="number" value={form.intermediateHigh} onChange={(e) => setForm({ ...form, intermediateHigh: e.target.value })} placeholder="opt" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-red-600">R &le; (mm)</Label>
                <Input type="number" value={form.resistantMax} onChange={(e) => setForm({ ...form, resistantMax: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Primary Targets</Label>
              <Input value={form.primaryTargets} onChange={(e) => setForm({ ...form, primaryTargets: e.target.value })} placeholder="e.g. Enterobacteriaceae" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.antibiotic || !form.sensitiveMin || !form.resistantMax}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={csvImportOpen}
        onOpenChange={(open) => {
          setCsvImportOpen(open);
          if (!open) {
            setCsvImportReport(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import AST results from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              Paste lab export data here. Rows are matched to this breakpoint list, then you can open{" "}
              <strong>Register case</strong> to review and save. Header row required. Columns (any order):{" "}
              <code className="rounded bg-muted px-1 py-0.5">antibiotic</code> or{" "}
              <code className="rounded bg-muted px-1 py-0.5">drug</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">symbol</code> or{" "}
              <code className="rounded bg-muted px-1 py-0.5">code</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">disc_content</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">zone_mm</code>.
            </p>
            <Textarea
              value={csvImportText}
              onChange={(e) => setCsvImportText(e.target.value)}
              rows={10}
              placeholder={`antibiotic,symbol,disc_content,zone_mm\nAmikacin,AK,30 µg,22\nCiprofloxacin,CIP,5 µg,28`}
              className="font-mono text-xs"
              data-testid="textarea-ast-csv"
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium">When opening Register case:</span>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  checked={csvImportMode === "replace"}
                  onChange={() => setCsvImportMode("replace")}
                />
                Replace AST rows on the form
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  checked={csvImportMode === "append"}
                  onChange={() => setCsvImportMode("append")}
                />
                Append to existing AST rows
              </label>
            </div>
            {csvImportReport && (
              <div className="rounded border bg-muted/30 p-2 text-xs">
                <div>
                  Parsed {csvImportReport.parsed} row
                  {csvImportReport.parsed === 1 ? "" : "s"} — matched{" "}
                  {csvImportReport.matched} against the breakpoint catalog.
                </div>
                {csvImportReport.unmatched.length > 0 && (
                  <div className="mt-1 text-amber-700 dark:text-amber-300">
                    Unmatched (imported as free-text rows): {csvImportReport.unmatched.join(", ")}
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCsvImportText("");
                  setCsvImportReport(null);
                  setCsvImportOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={stageCsvForRegisterCase}
                disabled={!csvImportText.trim()}
                data-testid="button-ast-csv-import-go"
              >
                Import and open Register case
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </StickyScrollPage>
  );
}

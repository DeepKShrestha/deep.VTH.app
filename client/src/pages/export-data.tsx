import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { DownloadFailedError } from "@/lib/download-error";
import { runExportDownload } from "@/lib/download-export";
import { DownloadRequestList } from "@/components/download-request-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BsDateInput } from "@/components/bs-date-input";
import { getTodayBsAd } from "@/lib/nepali-date";
import {
  describeApprovalWindow,
  evaluateExportRange,
  findActiveApproval,
} from "@/lib/export-approval";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import type { DownloadRequest } from "@shared/schema";

type AstExportLayout = "clinical" | "statistical";
type AstRowLayout = "wide" | "long";
type AstExportFormat = "csv" | "xlsx";

export default function ExportDataPage() {
  const { isStudent } = useAuth();
  const { toast } = useToast();
  const today = getTodayBsAd();

  const [dateFrom, setDateFrom] = useState("");
  const [dateFromAd, setDateFromAd] = useState("");
  const [dateTo, setDateTo] = useState(today.bs);
  const [dateToAd, setDateToAd] = useState(today.ad);
  const [reason, setReason] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");

  const { data: caseFilterOptions } = useQuery<{ species: string[] }>({
    queryKey: ["/api/cases/filter-options", "ast"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/cases/filter-options?scope=ast");
      return res.json();
    },
  });
  const speciesFilterOptions = caseFilterOptions?.species ?? [];

  const { data: myRequests = [] } = useQuery<DownloadRequest[]>({
    queryKey: ["/api/download-requests/mine"],
    enabled: isStudent,
  });
  const myAstRequests = myRequests.filter(
    (r) => (r.requestSource || "ast_report") === "ast_report",
  );
  const activeApproval = isStudent
    ? findActiveApproval(myRequests, "ast_report")
    : undefined;
  const hasApprovedRequest = Boolean(activeApproval);

  useEffect(() => {
    if (!activeApproval) return;
    if (activeApproval.dateFrom) setDateFrom(activeApproval.dateFrom);
    if (activeApproval.dateTo) setDateTo(activeApproval.dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeApproval?.id]);

  const rangeCheck = evaluateExportRange(
    activeApproval
      ? { dateFrom: activeApproval.dateFrom, dateTo: activeApproval.dateTo }
      : undefined,
    dateFrom,
    dateTo,
  );
  const exportDisabled = isStudent && (!hasApprovedRequest || !rangeCheck.ok);

  const requestMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/download-requests", {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        reason: reason || null,
        requestSource: "ast_report",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/download-requests/mine"],
      });
      toast({
        title: "Download request submitted. Waiting for admin approval.",
      });
      setReason("");
    },
    onError: () => {
      toast({
        title: "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  const handleDownload = (
    layout: AstExportLayout,
    rowLayout: AstRowLayout,
    kind: AstExportFormat,
  ) => {
    if (exportDisabled) {
      toast({
        title: rangeCheck.reason || "Download access is not available.",
        variant: "destructive",
      });
      return;
    }
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (rowLayout === "long") params.set("format", "long");
    if (speciesFilter.trim()) params.set("species", speciesFilter.trim());
    if (kind === "xlsx") params.set("output", "xlsx");
    params.set("layout", layout);

    const path = `/api/export/cases?${params.toString()}`;
    const fallback =
      kind === "xlsx"
        ? `ast-export-${layout}-${rowLayout}.xlsx`
        : `ast-export-${layout}-${rowLayout}.csv`;

    runExportDownload({ path, fallbackName: fallback })
      .then(({ rowCount }) => {
        const layoutLabel = layout === "clinical" ? "Clinical" : "Statistical";
        const rowLabel = rowLayout === "wide" ? "wide" : "long";
        toast({
          title: `${layoutLabel} ${rowLabel} ${kind === "xlsx" ? "Excel" : "CSV"} download started`,
          description:
            rowCount != null ? `${rowCount} row${rowCount === 1 ? "" : "s"}` : undefined,
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/download-requests/mine"],
        });
      })
      .catch((error) => {
        const description =
          error instanceof DownloadFailedError ? error.message : undefined;
        toast({
          title: "Download failed",
          description,
          variant: "destructive",
        });
      });
  };

  const showDownloadButtons = !isStudent || hasApprovedRequest;

  const renderFormatItems = (
    layout: AstExportLayout,
    rowLayout: AstRowLayout,
    testIdPrefix: string,
  ) => (
    <>
      <DropdownMenuItem
        onClick={() => handleDownload(layout, rowLayout, "csv")}
        data-testid={`button-download-${testIdPrefix}-csv`}
      >
        <FileText className="w-4 h-4 mr-2" />
        {rowLayout === "wide" ? "Wide" : "Long"} — CSV
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => handleDownload(layout, rowLayout, "xlsx")}
        data-testid={`button-download-${testIdPrefix}-xlsx`}
      >
        <FileSpreadsheet className="w-4 h-4 mr-2" />
        {rowLayout === "wide" ? "Wide" : "Long"} — Excel
      </DropdownMenuItem>
    </>
  );

  return (
    <StickyScrollPage
      maxWidthClass="max-w-3xl"
      bodyClassName="space-y-3 sm:space-y-4"
      sticky={
        <div className="flex items-center gap-3">
          <Link href="/ast-report">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-export-title">
              AST Export Data
            </h1>
            <p className="text-sm text-muted-foreground">
              Export AST cases for reports or statistical analysis.
            </p>
          </div>
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Date Range (BS)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Filter data by BS date. Leave &quot;from&quot; empty to include all past records.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BsDateInput
              value={dateFrom}
              onChange={(bs, ad) => {
                setDateFrom(bs);
                setDateFromAd(ad);
              }}
              label="From"
              testIdPrefix="export-from"
            />
            <BsDateInput
              value={dateTo}
              onChange={(bs, ad) => {
                setDateTo(bs);
                setDateToAd(ad);
              }}
              label="To"
              testIdPrefix="export-to"
            />
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="ast-export-species">Species (optional)</Label>
            <Select
              value={speciesFilter.trim() || "__all__"}
              onValueChange={(v) => setSpeciesFilter(v === "__all__" ? "" : v)}
            >
              <SelectTrigger id="ast-export-species" data-testid="select-export-species">
                <SelectValue placeholder="All species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All species</SelectItem>
                {speciesFilterOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {showDownloadButtons && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Download</CardTitle>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Clinical export</span> uses plain
                English column names (for example, &quot;Case Number&quot;, &quot;Sample Type&quot;).
                Best for reading in Excel and sharing reports. No audit/system fields.
              </p>
              <p>
                <span className="font-medium text-foreground">Statistical export</span> uses
                technical <code className="text-[10px]">snake_case</code> names and adds audit
                fields (case ID, counters, timestamps). Best for R, Python, SPSS, and similar
                tools.
              </p>
              <p>
                <span className="font-medium text-foreground">Wide layout</span> is one row per
                case with antibiotic results in columns.{" "}
                <span className="font-medium text-foreground">Long layout</span> is one row per
                antibiotic (better for pivoting and stats).
              </p>
              {isStudent && (
                <p className="text-amber-800 dark:text-amber-200">
                  As a student, your approved download is clinical only. Ask staff or an admin if
                  you need a statistical export.
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isStudent && activeApproval && (
              <div
                className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200"
                data-testid="text-approval-window"
              >
                <span className="font-medium">Approved window: </span>
                {describeApprovalWindow({
                  dateFrom: activeApproval.dateFrom,
                  dateTo: activeApproval.dateTo,
                })}
                <span className="text-emerald-700 dark:text-emerald-300">
                  {" "}
                  — single use; the approval is consumed when you download.
                </span>
              </div>
            )}
            {isStudent && !rangeCheck.ok && rangeCheck.reason && (
              <div
                className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
                data-testid="text-range-warning"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{rangeCheck.reason}</span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="gap-2 w-full sm:w-auto"
                  data-testid="button-download"
                  disabled={exportDisabled}
                >
                  <Download className="w-4 h-4" />
                  Download
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Clinical — wide (one row per case)</DropdownMenuLabel>
                {renderFormatItems("clinical", "wide", "clinical-wide")}
                <DropdownMenuLabel>Clinical — long (one row per antibiotic)</DropdownMenuLabel>
                {renderFormatItems("clinical", "long", "clinical-long")}
                {!isStudent && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Statistical — wide</DropdownMenuLabel>
                    {renderFormatItems("statistical", "wide", "statistical-wide")}
                    <DropdownMenuLabel>Statistical — long</DropdownMenuLabel>
                    {renderFormatItems("statistical", "long", "statistical-long")}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      )}

      {isStudent && !hasApprovedRequest && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-600" />
              Request Download Access
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              As a student, you need admin approval to download clinical AST data (readable
              Excel/CSV for your approved date range). Statistical exports are available to staff
              and admins.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for download</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Research project on antibiotic resistance patterns..."
                rows={2}
                data-testid="input-download-reason"
              />
            </div>
            <Button
              onClick={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              className="gap-2 w-full sm:w-auto"
              data-testid="button-submit-request"
            >
              <Download className="w-4 h-4" />
              {requestMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isStudent && myAstRequests.length > 0 && (
        <DownloadRequestList requests={myAstRequests} />
      )}
    </StickyScrollPage>
  );
}

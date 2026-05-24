import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { getAuthToken } from "@/lib/auth";
import { filenameFromContentDisposition } from "@/lib/content-disposition-filename";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Download,
  FileText,
  FileSpreadsheet,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { DownloadRequest } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function HospitalExportDataPage() {
  const { isStudent } = useAuth();
  const { toast } = useToast();
  const today = getTodayBsAd();

  const [dateFrom, setDateFrom] = useState("");
  const [dateFromAd, setDateFromAd] = useState("");
  const [dateTo, setDateTo] = useState(today.bs);
  const [dateToAd, setDateToAd] = useState(today.ad);
  const [reason, setReason] = useState("");

  const { data: myRequests = [] } = useQuery<DownloadRequest[]>({
    queryKey: ["/api/download-requests/mine"],
    enabled: isStudent,
  });
  const myHospitalRequests = myRequests.filter(
    (r) => (r.requestSource || "ast_report") === "hospital_case",
  );
  const activeApproval = isStudent
    ? findActiveApproval(myRequests, "hospital_case")
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
        requestSource: "hospital_case",
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

  const handleDownload = (kind: "csv" | "xlsx") => {
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
    if (kind === "xlsx") params.set("output", "xlsx");

    const token = getAuthToken();
    const url = `${API_BASE}/api/export/hospital-cases?${params.toString()}`;
    const fallback = kind === "xlsx" ? "hospital-export.xlsx" : "hospital-cases.csv";

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Download failed");
        }
        const disposition = res.headers.get("Content-Disposition");
        const downloadName = filenameFromContentDisposition(disposition, fallback);
        const rowCount = res.headers.get("X-Export-Row-Count");
        return res.blob().then((blob) => ({ blob, downloadName, rowCount }));
      })
      .then(({ blob, downloadName, rowCount }) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        const n = rowCount ? Number.parseInt(rowCount, 10) : NaN;
        toast({
          title: kind === "xlsx" ? "Excel download started" : "CSV download started",
          description: Number.isFinite(n) ? `${n} row${n === 1 ? "" : "s"}` : undefined,
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/download-requests/mine"],
        });
      })
      .catch(() => {
        toast({
          title: "Download failed. You may not have permission.",
          variant: "destructive",
        });
      });
  };

  const showDownloadButtons = !isStudent || hasApprovedRequest;

  return (
    <StickyScrollPage
      maxWidthClass="max-w-3xl"
      bodyClassName="space-y-6"
      sticky={
        <div className="flex items-center gap-3">
          <Link href="/new-case">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-export-title">
              Hospital Export Data
            </h1>
            <p className="text-sm text-muted-foreground">
              Pick a Bikram Sambat date range, then download CSV for offline analysis.
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
              testIdPrefix="hospital-export-from"
            />
            <BsDateInput
              value={dateTo}
              onChange={(bs, ad) => {
                setDateTo(bs);
                setDateToAd(ad);
              }}
              label="To"
              testIdPrefix="hospital-export-to"
            />
          </div>
        </CardContent>
      </Card>

      {showDownloadButtons && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Download</CardTitle>
            <p className="text-xs text-muted-foreground">
              One row per case: stable <code className="text-[10px]">snake_case</code> core columns,
              then extra columns named like the registration form. CSV is UTF-8 with BOM; Excel adds
              a frozen header row and filters. Nested values stay as JSON in the cell.
            </p>
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
                  {" "}— single use; the approval is consumed when you download.
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
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => handleDownload("csv")}
                className="gap-2 w-full sm:flex-1"
                data-testid="button-download-csv"
                disabled={exportDisabled}
              >
                <FileText className="w-4 h-4" />
                Download CSV
              </Button>
              <Button
                onClick={() => handleDownload("xlsx")}
                variant="secondary"
                className="gap-2 w-full sm:flex-1"
                data-testid="button-download-xlsx"
                disabled={exportDisabled}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download Excel
              </Button>
            </div>
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
              As a student, you need admin approval to download data. Submit a request below.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for download</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Research project on hospital case patterns..."
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

      {isStudent && myHospitalRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">My Download Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myHospitalRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0"
              >
                <div>
                  <div className="text-xs text-muted-foreground">
                    {r.dateFrom && `From: ${r.dateFrom}`} {r.dateTo && `To: ${r.dateTo}`}
                    {!r.dateFrom && !r.dateTo && "All dates"}
                  </div>
                  {r.reason && (
                    <div className="text-xs text-muted-foreground">{r.reason}</div>
                  )}
                </div>
                <div>
                  {r.status === "pending" && (
                    <Badge className="bg-amber-100 text-amber-800 border-0 text-xs gap-1">
                      <Clock className="w-3 h-3" /> Pending
                    </Badge>
                  )}
                  {r.status === "approved" && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs gap-1">
                      <CheckCircle className="w-3 h-3" /> Approved
                    </Badge>
                  )}
                  {r.status === "rejected" && (
                    <Badge className="bg-red-100 text-red-800 border-0 text-xs gap-1">
                      <XCircle className="w-3 h-3" /> Rejected
                    </Badge>
                  )}
                  {r.status === "downloaded" && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs gap-1">
                      <CheckCircle className="w-3 h-3" /> Downloaded
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </StickyScrollPage>
  );
}

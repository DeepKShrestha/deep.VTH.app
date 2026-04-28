import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BsDateInput } from "@/components/bs-date-input";
import { getTodayBsAd } from "@/lib/nepali-date";
import {
  ArrowLeft,
  Download,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { DownloadRequest } from "@shared/schema";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export default function ExportDataPage() {
  const { user, isStudent } = useAuth();
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

  const hasApprovedRequest = myRequests.some((r) => r.status === "approved");

  const requestMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/download-requests", {
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        reason: reason || null,
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

  const handleDownload = () => {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const token = getAuthToken();
  const url = `${API_BASE}/api/export/cases?${params.toString()}`;

  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error("Download failed");
      }
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ast-cases.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast({ title: "CSV download started" });

      // NEW: refresh "My Download Requests"
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
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1
            className="text-lg font-semibold"
            data-testid="text-export-title"
          >
            Export Data
          </h1>
          <p className="text-sm text-muted-foreground">
            Download case data for research and analysis
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Date Range (BS)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Filter data by BS date. Leave &quot;from&quot; empty to include all
            past records.
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
        </CardContent>
      </Card>

      {showDownloadButtons && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Download</CardTitle>
            <p className="text-xs text-muted-foreground">
              CSV is compatible with Excel, Google Sheets, and most statistical
              software.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleDownload}
                className="gap-2 w-full sm:flex-1"
                data-testid="button-download-csv"
              >
                <FileText className="w-4 h-4" />
                Download CSV
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
              As a student, you need admin approval to download data. Submit a
              request below.
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

      {isStudent && myRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">My Download Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm border-b border-border last:border-0 pb-2 last:pb-0"
              >
                <div>
                  <div className="text-xs text-muted-foreground">
                    {r.dateFrom && `From: ${r.dateFrom}`}{" "}
                    {r.dateTo && `To: ${r.dateTo}`}
                    {!r.dateFrom && !r.dateTo && "All dates"}
                  </div>
                  {r.reason && (
                    <div className="text-xs text-muted-foreground">
                      {r.reason}
                    </div>
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
    </div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import type { DownloadRequest } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-0 text-xs gap-1">
        <Clock className="w-3 h-3" /> Pending
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs gap-1">
        <CheckCircle className="w-3 h-3" /> Approved
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-800 border-0 text-xs gap-1">
        <XCircle className="w-3 h-3" /> Rejected
      </Badge>
    );
  }
  if (status === "downloaded") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs gap-1">
        <CheckCircle className="w-3 h-3" /> Downloaded
      </Badge>
    );
  }
  return null;
}

/**
 * "My Download Requests" card shared by the AST and Hospital export pages.
 * The caller decides whether to render it (e.g. student + non-empty list).
 */
export function DownloadRequestList({ requests }: { requests: DownloadRequest[] }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">My Download Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r) => (
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
              <StatusBadge status={r.status} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

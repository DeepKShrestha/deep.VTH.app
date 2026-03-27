import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Printer, Trash2, Sparkles } from "lucide-react";
import { formatBsDate, formatAdDate } from "@/lib/nepali-date";
import { useAuth } from "@/lib/auth";

interface AstRow {
  antibiotic: string;
  symbol?: string;
  discContent?: string;
  sensitivity: "S" | "I" | "R";
  zoneSize?: string;
  manualOverride?: boolean;
}

function sensitivityBadge(s: string) {
  switch (s) {
    case "S": return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">Sensitive</Badge>;
    case "I": return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0">Intermediate</Badge>;
    case "R": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0">Resistant</Badge>;
    default: return <Badge variant="secondary">{s}</Badge>;
  }
}

export default function CaseView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const { data: caseData, isLoading } = useQuery<Case>({
    queryKey: ["/api/cases", params.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cases/${params.id}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/cases/${params.id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Case deleted" });
      setLocation("/cases");
    },
  });

  const astResults: AstRow[] = useMemo(() => {
    if (!caseData?.astResults) return [];
    try { return JSON.parse(caseData.astResults); } catch { return []; }
  }, [caseData]);

  const recommendations = useMemo(() => {
    return astResults
      .filter((r) => r.sensitivity === "S" && r.zoneSize && parseFloat(r.zoneSize) > 0)
      .sort((a, b) => parseFloat(b.zoneSize || "0") - parseFloat(a.zoneSize || "0"))
      .slice(0, 3);
  }, [astResults]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-muted-foreground">Case not found.</p>
        <Link href="/cases"><Button variant="outline">Back to Cases</Button></Link>
      </div>
    );
  }

    return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cases">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1
              className="text-lg font-semibold"
              data-testid="text-case-number"
            >
              {caseData.caseNumber}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{formatBsDate(caseData.date)}</span>
              {caseData.dateAd && (
                <span className="text-xs">
                  ({formatAdDate(caseData.dateAd)})
                </span>
              )}
              {caseData.dailyNumber && (
                <span>Day #{caseData.dailyNumber}</span>
              )}
              {caseData.monthlyNumber && (
                <span>Month #{caseData.monthlyNumber}</span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: last updated + buttons */}
        <div className="flex flex-col items-end gap-1">
          {caseData.lastUpdatedBy && caseData.updatedAt && (
            <p className="text-[11px] text-muted-foreground">
              Last updated by{" "}
              {caseData.lastUpdatedByName ||
                `User ID ${caseData.lastUpdatedBy}`}{" "}
              on {new Date(caseData.updatedAt).toLocaleString()}
            </p>
          )}

          <div className="flex gap-2">
            <Link href={`/print/${caseData.id}`}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-testid="button-print"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </Button>
            </Link>

            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    data-testid="button-delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this case?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete case {caseData.caseNumber}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Bill Number */}
      {caseData.billNumber && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs font-medium">Bill/Reg No:</span>
              <span className="font-semibold">{caseData.billNumber}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Owner Information */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Owner Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Name</dt>
              <dd>{caseData.ownerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Phone</dt>
              <dd>{caseData.ownerPhone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs font-medium mb-0.5">Address</dt>
              <dd>{caseData.ownerAddress}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Animal Information */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Animal Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Species</dt><dd><Badge variant="secondary">{caseData.species}</Badge></dd></div>
            <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Breed</dt><dd>{caseData.breed}</dd></div>
            {caseData.animalName && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Name</dt><dd>{caseData.animalName}</dd></div>}
            {caseData.age && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Age</dt><dd>{caseData.age}</dd></div>}
            {caseData.sex && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Sex</dt><dd>{caseData.sex}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      {/* Sample Information */}
      {(caseData.sampleType || caseData.sampleDate || caseData.cultureResult) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sample Information</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              {caseData.sampleType && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Sample Type</dt><dd>{caseData.sampleType}</dd></div>}
              {caseData.sampleDate && <div><dt className="text-muted-foreground text-xs font-medium mb-0.5">Collection Date</dt><dd>{formatBsDate(caseData.sampleDate)}{caseData.sampleDateAd && <span className="text-xs text-muted-foreground ml-1">({formatAdDate(caseData.sampleDateAd)})</span>}</dd></div>}
              {caseData.cultureResult && <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs font-medium mb-0.5">Organism Isolated</dt><dd className="font-medium">{caseData.cultureResult}</dd></div>}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* AST Results */}
      {astResults.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">AST Results</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">S.N.</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Antibiotic</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Disc</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs">Zone (mm)</th>
                    <th className="text-left py-2 font-medium text-muted-foreground text-xs">Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {astResults.map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4">{row.antibiotic}{row.symbol ? ` (${row.symbol})` : ""}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.discContent || "—"}</td>
                      <td className="py-2 pr-4">{row.zoneSize || "—"}</td>
                      <td className="py-2">{sensitivityBadge(row.sensitivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Recommended Antibiotics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <span className="font-medium">{rec.antibiotic}{rec.symbol ? ` (${rec.symbol})` : ""}</span>
                  <span className="text-muted-foreground">— zone: {rec.zoneSize} mm</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remarks */}
      {caseData.remarks && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Remarks</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{caseData.remarks}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

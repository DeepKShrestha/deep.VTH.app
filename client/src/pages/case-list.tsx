import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Search,
  ClipboardPlus,
  Eye,
  FolderOpen,
  Clock,
} from "lucide-react";
import { Trash2 } from "lucide-react";
import { formatBsDate } from "@/lib/nepali-date";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CasesPageResponse = {
  items: Case[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function CaseList({
  backHref = "/",
  scope,
}: {
  backHref?: string;
  scope?: "ast" | "hospital";
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showCaseLogs, setShowCaseLogs] = useState(false);
  const [caseLogsFilter, setCaseLogsFilter] = useState("");
  const { isAdmin, isStudent, canRegisterAstCase, canRegisterHospitalCase } = useAuth();
  const { toast } = useToast();
  const isHospitalHistory = scope ? scope === "hospital" : backHref === "/new-case";
  const caseScope = isHospitalHistory ? "hospital" : "ast";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [debouncedSpecies, setDebouncedSpecies] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [search]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedSpecies(speciesFilter.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [speciesFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedSpecies, caseScope]);

  const listQueryKey = useMemo(
    () => ["/api/cases", caseScope, debouncedSearch, debouncedSpecies, page, pageSize] as const,
    [caseScope, debouncedSearch, debouncedSpecies, page],
  );

  const { data: casesPayload, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("scope", caseScope);
      params.set("paginated", "true");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (debouncedSpecies) params.set("species", debouncedSpecies);
      const res = await apiRequest("GET", `/api/cases?${params.toString()}`);
      const body = (await res.json()) as CasesPageResponse | Case[];
      if (Array.isArray(body)) {
        return {
          items: body,
          page: 1,
          pageSize: body.length,
          total: body.length,
          totalPages: 1,
        } satisfies CasesPageResponse;
      }
      return body as CasesPageResponse;
    },
  });

  const filtered = casesPayload?.items ?? [];
  const total = casesPayload?.total ?? 0;
  const totalPages = Math.max(1, casesPayload?.totalPages ?? 1);

  const deleteCaseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cases/${id}?scope=${caseScope}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases", caseScope] });
      queryClient.invalidateQueries({ queryKey: ["/api/case-change-logs"] });
      toast({ title: "Case deleted" });
    },
  });

  const caseLogScope: "hospital" | "ast" = isHospitalHistory ? "hospital" : "ast";
  const caseDetailBasePath =
    caseScope === "hospital" ? "/new-case/cases" : "/ast-report/cases";
  const canCreateFromThisList = isHospitalHistory
    ? canRegisterHospitalCase
    : canRegisterAstCase && !isStudent;
  const createCaseHref = isHospitalHistory ? "/new-case/register" : "/register";
  const emptyStateCaseLabel = isHospitalHistory ? "VTH case" : "AST case";
  type CaseChangeLog = {
    id: number;
    caseId: number | null;
    caseNumber: string;
    caseScope: "ast" | "hospital";
    action: "created" | "deleted";
    actorUserId: number;
    actorRole: string;
    actorName: string;
    actorUsername: string;
    createdAt: string;
  };
  const { data: caseChangeLogs = [] } = useQuery<CaseChangeLog[]>({
    queryKey: ["/api/case-change-logs", caseLogScope],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/case-change-logs?scope=${encodeURIComponent(caseLogScope)}`,
      );
      return res.json();
    },
    enabled: isAdmin && showCaseLogs,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const normalizedCaseLogsFilter = caseLogsFilter.trim().toLowerCase();
  const filteredCaseLogs = caseChangeLogs.filter((row) => {
    if (!normalizedCaseLogsFilter) return true;
    return (
      row.caseNumber.toLowerCase().includes(normalizedCaseLogsFilter) ||
      row.actorName.toLowerCase().includes(normalizedCaseLogsFilter) ||
      row.actorUsername.toLowerCase().includes(normalizedCaseLogsFilter)
    );
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold" data-testid="text-page-title">
            Previous Cases
          </h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {canCreateFromThisList && (
            <Link href={createCaseHref} className="w-full sm:w-auto">
              <Button size="sm" className="gap-1.5" data-testid="button-new-case">
                <ClipboardPlus className="w-3.5 h-3.5" />
                New Case
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isAdmin && (
        <Card>
          <CardContent className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isHospitalHistory ? "Hospital Case Change Logs" : "AST Case Change Logs"}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowCaseLogs((v) => !v)}
              data-testid="button-toggle-case-change-logs"
            >
              <Clock className="w-3.5 h-3.5" />
              {showCaseLogs ? "Hide Logs" : "View Logs"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isAdmin && showCaseLogs && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <Input
              value={caseLogsFilter}
              onChange={(e) => setCaseLogsFilter(e.target.value)}
              placeholder="Search by case number, actor, or username..."
              className="h-8 text-xs sm:max-w-sm"
              data-testid="input-case-change-logs-filter"
            />
            {filteredCaseLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No case change logs found.</p>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">Case</th>
                      <th className="px-2 py-1.5 font-medium">Action</th>
                      <th className="px-2 py-1.5 font-medium">Actor</th>
                      <th className="px-2 py-1.5 font-medium">Username</th>
                      <th className="px-2 py-1.5 font-medium">Role</th>
                      <th className="px-2 py-1.5 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCaseLogs.map((row) => (
                      <tr key={`case-log-${row.id}`} className="border-t align-top">
                        <td className="px-2 py-1.5">{row.caseNumber}</td>
                        <td className="px-2 py-1.5">
                          {row.action === "created" ? "Created" : "Deleted"}
                        </td>
                        <td className="px-2 py-1.5">{row.actorName}</td>
                        <td className="px-2 py-1.5">
                          {row.actorUsername ? `@${row.actorUsername}` : "-"}
                        </td>
                        <td className="px-2 py-1.5">{row.actorRole}</td>
                        <td className="px-2 py-1.5">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by case number, owner, species, breed, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="text"
          placeholder="Species (exact match, e.g. Canine)"
          value={speciesFilter}
          onChange={(e) => setSpeciesFilter(e.target.value)}
          className="h-9 text-sm sm:max-w-xs"
          data-testid="input-species-filter"
        />
        <p className="text-xs text-muted-foreground self-center">
          {total} case{total === 1 ? "" : "s"}
          {debouncedSearch || debouncedSpecies ? " (filtered)" : ""}
        </p>
      </div>

            {/* Cases */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <FolderOpen className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {debouncedSearch || debouncedSpecies ? "No matching cases" : "No cases yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch || debouncedSpecies
                ? "Try a different search term."
                : `Register your first ${emptyStateCaseLabel} to get started.`}
            </p>
          </div>
          {!debouncedSearch && !debouncedSpecies && canCreateFromThisList && (
            <Link href={createCaseHref}>
              <Button size="sm" className="gap-1.5">
                <ClipboardPlus className="w-3.5 h-3.5" />
                Register Case
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Selected: {selectedIds.length}</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    disabled={selectedIds.length === 0}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete selected
                  </Button>
                </AlertDialogTrigger>
                <DeleteBatchDialog
                  count={selectedIds.length}
                  onConfirm={async () => {
                    await Promise.all(selectedIds.map((id) => apiRequest("DELETE", `/api/cases/${id}?scope=${caseScope}`)));
                    setSelectedIds([]);
                    queryClient.invalidateQueries({ queryKey: ["/api/cases", caseScope] });
                    queryClient.invalidateQueries({ queryKey: ["/api/case-change-logs"] });
                    toast({ title: "Selected cases deleted" });
                  }}
                />
              </AlertDialog>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((c) => {
              let astCount = 0;
              try {
                const parsed = JSON.parse(c.astResults || "[]");
                astCount = parsed.length;
              } catch {
                /* ignore */
              }

              return (
                <Card
                  key={c.id}
                  className="transition-colors hover:bg-accent/50"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedIds.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => [...prev, c.id]);
                              } else {
                                setSelectedIds((prev) =>
                                  prev.filter((id) => id !== c.id)
                                );
                              }
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold text-sm"
                              data-testid={`text-case-number-${c.id}`}
                            >
                              {c.caseNumber}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-xs"
                            >
                              {c.species}
                            </Badge>
                            {c.breed && (
                              <span className="text-xs text-muted-foreground">
                                {c.breed}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-sm text-muted-foreground truncate"
                            data-testid={`text-owner-${c.id}`}
                          >
                            {c.ownerName} &middot; {c.ownerPhone}
                            {c.billNumber && (
                              <span> &middot; Bill #{c.billNumber}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{formatBsDate(c.date)}</span>
                            {astCount > 0 && (
                              <span>
                                {astCount} antibiotic
                                {astCount > 1 ? "s" : ""} tested
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto shrink-0">
                        <Link href={`${caseDetailBasePath}/${c.id}?scope=${caseScope}`} className="w-full sm:w-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 w-full sm:w-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </Button>
                        </Link>

                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-destructive hover:text-destructive w-full sm:w-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <DeleteCaseDialog
                              caseNumber={c.caseNumber}
                              onConfirm={() => deleteCaseMutation.mutate(c.id)}
                            />
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
             })}
          </div>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DeleteCaseDialog({
  caseNumber,
  onConfirm,
}: {
  caseNumber: string;
  onConfirm: () => void;
}) {
  const [input, setInput] = useState("");

  const canDelete = input === "CONFIRM";

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete case {caseNumber}?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. To confirm, type{" "}
          <strong>CONFIRM</strong> below.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="mt-2 space-y-2">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type CONFIRM"
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={!canDelete}
          onClick={onConfirm}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function DeleteBatchDialog({
  count,
  onConfirm,
}: {
  count: number;
  onConfirm: () => Promise<void>;
}) {
  const [input, setInput] = useState("");

  const canDelete = input === "CONFIRM";

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {count} selected cases?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. To confirm, type{" "}
          <strong>CONFIRM</strong> below.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="mt-2 space-y-2">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type CONFIRM"
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={!canDelete}
          onClick={async () => {
            if (canDelete) {
              await onConfirm();
            }
          }}
        >
          Delete selected
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
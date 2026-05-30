import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Case } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Copy,
  Rows3,
  LayoutList,
  Trash2,
} from "lucide-react";
import { CaseListDateFilterDialog } from "@/components/case-list-date-filter-dialog";
import { formatBsDate } from "@/lib/nepali-date";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import {
  casesListQueryKey,
  fetchCasesPage,
} from "@/lib/cases-list-query";

const RECENT_SEARCHES_KEY = "vth:case-list-recent-search";
const COMPACT_LIST_KEY = "vth:case-list-compact";

function readCaseListParamsFromHash(): {
  q: string;
  species: string;
  dateFrom: string;
  dateTo: string;
  page: number;
} {
  if (typeof window === "undefined") {
    return { q: "", species: "", dateFrom: "", dateTo: "", page: 1 };
  }
  const hash = window.location.hash.replace(/^#/, "");
  const qi = hash.indexOf("?");
  const qs = qi >= 0 ? hash.slice(qi + 1) : "";
  const p = new URLSearchParams(qs);
  const pg = Math.max(1, Number.parseInt(p.get("page") || "1", 10) || 1);
  return {
    q: p.get("q") ?? "",
    species: p.get("species") ?? "",
    dateFrom: p.get("dateFrom") ?? "",
    dateTo: p.get("dateTo") ?? "",
    page: pg,
  };
}

function readRecentSearches(scope: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${RECENT_SEARCHES_KEY}:${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(scope: string, term: string) {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    const prev = readRecentSearches(scope);
    const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    window.localStorage.setItem(`${RECENT_SEARCHES_KEY}:${scope}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clearRecentSearches(scope: string) {
  try {
    window.localStorage.removeItem(`${RECENT_SEARCHES_KEY}:${scope}`);
  } catch {
    /* ignore */
  }
}

export default function CaseList({
  backHref = "/",
  scope,
}: {
  backHref?: string;
  scope?: "ast" | "hospital";
}) {
  const initParams = useMemo(() => readCaseListParamsFromHash(), []);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showCaseLogs, setShowCaseLogs] = useState(false);
  const [caseLogsFilter, setCaseLogsFilter] = useState("");
  const { isAdmin, canRegisterAstCase, canRegisterHospitalCase } = useAuth();
  const { toast } = useToast();
  const [path, setLocation] = useLocation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filterDebounceRef = useRef({
    q: initParams.q.trim(),
    sp: initParams.species.trim(),
    df: initParams.dateFrom.trim(),
    dt: initParams.dateTo.trim(),
  });

  const isHospitalHistory = scope ? scope === "hospital" : backHref === "/new-case";
  const caseScope = isHospitalHistory ? "hospital" : "ast";
  const [search, setSearch] = useState(initParams.q);
  const [debouncedSearch, setDebouncedSearch] = useState(initParams.q.trim());
  const [speciesFilter, setSpeciesFilter] = useState(initParams.species);
  const [debouncedSpecies, setDebouncedSpecies] = useState(initParams.species.trim());
  const [dateFromBs, setDateFromBs] = useState(initParams.dateFrom);
  const [dateToBs, setDateToBs] = useState(initParams.dateTo);
  const [debouncedDateFrom, setDebouncedDateFrom] = useState(initParams.dateFrom.trim());
  const [debouncedDateTo, setDebouncedDateTo] = useState(initParams.dateTo.trim());
  const [page, setPage] = useState(initParams.page);
  const pageSize = 20;

  const hasActiveFilters = Boolean(
    debouncedSearch || debouncedSpecies || debouncedDateFrom || debouncedDateTo,
  );
  const dateRangeInvalid =
    Boolean(debouncedDateFrom && debouncedDateTo) &&
    debouncedDateFrom > debouncedDateTo;

  const [compactCards, setCompactCards] = useState(() => {
    try {
      return window.localStorage.getItem(COMPACT_LIST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    typeof window !== "undefined" ? readRecentSearches(caseScope) : [],
  );

  useEffect(() => {
    setRecentSearches(readRecentSearches(caseScope));
  }, [caseScope]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [search]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedSpecies(speciesFilter.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [speciesFilter]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedDateFrom(dateFromBs.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [dateFromBs]);

  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedDateTo(dateToBs.trim()), 350);
    return () => window.clearTimeout(tmr);
  }, [dateToBs]);

  useEffect(() => {
    const prev = filterDebounceRef.current;
    const nextQ = debouncedSearch;
    const nextSp = debouncedSpecies;
    const nextDf = debouncedDateFrom;
    const nextDt = debouncedDateTo;
    if (prev.q !== nextQ || prev.sp !== nextSp || prev.df !== nextDf || prev.dt !== nextDt) {
      filterDebounceRef.current = { q: nextQ, sp: nextSp, df: nextDf, dt: nextDt };
      setPage(1);
    }
  }, [debouncedSearch, debouncedSpecies, debouncedDateFrom, debouncedDateTo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPACT_LIST_KEY, compactCards ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [compactCards]);

  useEffect(() => {
    const basePath = path.split("?")[0];
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (debouncedSpecies) params.set("species", debouncedSpecies);
    if (debouncedDateFrom) params.set("dateFrom", debouncedDateFrom);
    if (debouncedDateTo) params.set("dateTo", debouncedDateTo);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const next = qs ? `${basePath}?${qs}` : basePath;
    if (typeof window !== "undefined") {
      const current = window.location.hash.replace(/^#/, "");
      if (current === next) return;
    }
    setLocation(next, { replace: true });
  }, [debouncedSearch, debouncedSpecies, debouncedDateFrom, debouncedDateTo, page, path, setLocation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" && e.key !== "?") return;
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          (el as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        toast({
          title: "Keyboard shortcuts",
          description: "Press / to focus search. Filters and page sync to the URL for sharing.",
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  const effectiveDateFrom = dateRangeInvalid ? "" : debouncedDateFrom;
  const effectiveDateTo = dateRangeInvalid ? "" : debouncedDateTo;

  const listQueryKey = useMemo(
    () =>
      casesListQueryKey(
        caseScope,
        debouncedSearch,
        debouncedSpecies,
        effectiveDateFrom,
        effectiveDateTo,
        page,
        pageSize,
      ),
    [caseScope, debouncedSearch, debouncedSpecies, effectiveDateFrom, effectiveDateTo, page, pageSize],
  );

  const { data: casesPayload, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      fetchCasesPage(
        caseScope,
        debouncedSearch,
        debouncedSpecies,
        effectiveDateFrom,
        effectiveDateTo,
        page,
        pageSize,
      ),
  });

  const { data: caseFilterOptions } = useQuery<{ species: string[] }>({
    queryKey: ["/api/cases/filter-options", caseScope],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/cases/filter-options?scope=${caseScope}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const speciesFilterOptions = useMemo(() => {
    const fromCases = caseFilterOptions?.species ?? [];
    const selected = speciesFilter.trim();
    if (selected && !fromCases.some((s) => s.toLowerCase() === selected.toLowerCase())) {
      return [selected, ...fromCases].sort((a, b) => a.localeCompare(b));
    }
    return fromCases;
  }, [caseFilterOptions?.species, speciesFilter]);

  const filtered = casesPayload?.items ?? [];
  const total = casesPayload?.total ?? 0;
  const totalPages = Math.max(1, casesPayload?.totalPages ?? 1);

  useEffect(() => {
    if (isLoading) return;
    if (!debouncedSearch.trim()) return;
    if (filtered.length === 0) return;
    pushRecentSearch(caseScope, debouncedSearch);
    setRecentSearches(readRecentSearches(caseScope));
  }, [isLoading, debouncedSearch, filtered.length, caseScope]);

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
  // The legacy `&& !isStudent` on the AST branch was a redundant guard
  // from when students could never register AST cases. With the admin
  // toggle in place, `canRegisterAstCase` already encodes the right
  // answer (role toggle + batch override), so the exclusion would only
  // mis-hide the button for students whom an admin had granted access.
  const canCreateFromThisList = isHospitalHistory
    ? canRegisterHospitalCase
    : canRegisterAstCase;
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

  const showBulkToolbar = isAdmin && !isLoading && filtered.length > 0;

  return (
    <StickyScrollPage
      bodyClassName="space-y-4 sm:space-y-6"
      stickyClassName="max-sm:max-h-[min(38vh,17rem)] max-sm:overflow-y-auto"
      sticky={
        <div className="space-y-3 sm:space-y-4">
          {/* Breadcrumb is noise on a phone — the back arrow + title already
              tell the user where they are. Hide below `sm`. */}
          <div className="hidden sm:block">
            <PageBreadcrumbs
              items={
                isHospitalHistory
                  ? [
                      { label: "Hospital", href: "/new-case" },
                      { label: "Previous cases" },
                    ]
                  : [
                      { label: "AST module", href: "/ast-report" },
                      { label: "Previous cases" },
                    ]
              }
            />
          </div>
          {/* Title row + actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto">
              <Link href={backHref}>
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <h1 className="text-base sm:text-lg font-semibold truncate flex-1" data-testid="text-page-title">
                Previous Cases
              </h1>
              {/* New Case on mobile sits inline with the title so the toolbar
                  uses one row instead of two. It moves to the desktop action
                  cluster below at `sm+`. */}
              {canCreateFromThisList && (
                <Link href={createCaseHref} className="sm:hidden shrink-0">
                  <Button size="sm" className="gap-1.5" data-testid="button-new-case-mobile">
                    <ClipboardPlus className="w-3.5 h-3.5" />
                    New
                  </Button>
                </Link>
              )}
            </div>
            {/* Compact toggle is only useful on desktop (mobile is always
                cards in a single column), and the New Case button has its
                own mobile home above. Both hidden below `sm`. */}
            <div className="hidden sm:flex flex-row items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                title={compactCards ? "Comfortable card spacing" : "Compact list (denser cards)"}
                onClick={() => setCompactCards((c) => !c)}
              >
                {compactCards ? (
                  <>
                    <LayoutList className="w-3.5 h-3.5" />
                    Comfortable
                  </>
                ) : (
                  <>
                    <Rows3 className="w-3.5 h-3.5" />
                    Compact
                  </>
                )}
              </Button>
              {canCreateFromThisList && (
                <Link href={createCaseHref}>
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
              <CardContent className="p-3 flex flex-row items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground truncate">
                  {isHospitalHistory ? "Hospital Case Change Logs" : "AST Case Change Logs"}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={() => setShowCaseLogs((v) => !v)}
                  data-testid="button-toggle-case-change-logs"
                >
                  <Clock className="w-3.5 h-3.5" />
                  {showCaseLogs ? "Hide" : "View"}
                  <span className="hidden sm:inline">{showCaseLogs ? " Logs" : " Logs"}</span>
                </Button>
              </CardContent>
            </Card>
          )}

          {recentSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Recent search:</span>
              {recentSearches.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSearch(t)}
                >
                  {t}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                data-testid="button-clear-recent-searches"
                onClick={() => {
                  clearRecentSearches(caseScope);
                  setRecentSearches([]);
                  toast({ title: "Recent searches cleared" });
                }}
              >
                Clear all
              </Button>
            </div>
          )}

          <div className="space-y-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="Search cases…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
                aria-label="Search cases"
                title="Search by case number, owner, species, breed, or phone"
              />
            </div>
            {/* Keyboard shortcut hint is meaningless on phones (no `/` or `?`
                keys in the soft keyboard's default plane and no URL bar to
                share). Hidden below `sm`. */}
            <p className="hidden sm:block text-[11px] text-muted-foreground">
              Press <kbd className="px-1 rounded border bg-muted font-mono text-[10px]">/</kbd> to focus
              search · <kbd className="px-1 rounded border bg-muted font-mono text-[10px]">?</kbd> for
              shortcuts · filters sync to the URL for sharing
            </p>
          </div>
          {/* Filter row:
                - Mobile: species + date sit on one row (`grid-cols-[1fr,auto]`)
                  so they fit without stacking; result count drops below.
                - Desktop: original wrap layout. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center sm:flex sm:flex-row sm:items-end sm:flex-wrap">
            <Select
              value={speciesFilter.trim() || "__all__"}
              onValueChange={(value) => setSpeciesFilter(value === "__all__" ? "" : value)}
            >
              <SelectTrigger
                className="text-sm sm:max-w-xs h-11 md:h-9"
                data-testid="select-species-filter"
              >
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
            <CaseListDateFilterDialog
              dateFrom={dateFromBs}
              dateTo={dateToBs}
              onApply={(from, to) => {
                setDateFromBs(from);
                setDateToBs(to);
              }}
              onClear={() => {
                setDateFromBs("");
                setDateToBs("");
              }}
            />
            <p className="col-span-2 text-xs text-muted-foreground sm:pb-2">
              {total} case{total === 1 ? "" : "s"}
              {hasActiveFilters && !dateRangeInvalid ? " (filtered)" : ""}
            </p>
            {dateRangeInvalid ? (
              <p className="col-span-2 text-xs text-destructive w-full sm:pb-2">
                Date filter: from must be on or before to.
              </p>
            ) : null}
          </div>

          {showBulkToolbar && (
            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Selected: {selectedIds.length}</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-destructive hover:text-destructive"
                    disabled={selectedIds.length === 0}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete selected
                  </Button>
                </AlertDialogTrigger>
                <DeleteBatchDialog
                  count={selectedIds.length}
                  onConfirm={async () => {
                    await Promise.all(
                      selectedIds.map((id) =>
                        apiRequest("DELETE", `/api/cases/${id}?scope=${caseScope}`),
                      ),
                    );
                    setSelectedIds([]);
                    queryClient.invalidateQueries({ queryKey: ["/api/cases", caseScope] });
                    queryClient.invalidateQueries({ queryKey: ["/api/case-change-logs"] });
                    toast({ title: "Selected cases deleted" });
                  }}
                />
              </AlertDialog>
            </div>
          )}
        </div>
      }
    >
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
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            {row.caseId != null ? (
                              <Link
                                href={`${caseDetailBasePath}/${row.caseId}?scope=${caseScope}`}
                                className="text-primary underline-offset-2 hover:underline truncate font-medium"
                              >
                                {row.caseNumber}
                              </Link>
                            ) : (
                              <span className="truncate">{row.caseNumber}</span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              title="Copy case number"
                              onClick={() => {
                                void navigator.clipboard.writeText(row.caseNumber).then(
                                  () => {
                                    toast({ title: "Copied", description: row.caseNumber });
                                  },
                                  () => {
                                    toast({
                                      title: "Copy failed",
                                      description: "Your browser blocked clipboard access.",
                                      variant: "destructive",
                                    });
                                  },
                                );
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className={compactCards ? "p-3 space-y-2" : "p-4 space-y-2"}>
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
              {dateRangeInvalid
                ? "Invalid date range"
                : hasActiveFilters
                  ? "No matching cases"
                  : "No cases yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {dateRangeInvalid
                ? "Choose a from date on or before the to date."
                : hasActiveFilters
                  ? "Try a different search term or clear filters."
                  : `Register your first ${emptyStateCaseLabel} to get started.`}
            </p>
          </div>
          {(hasActiveFilters || dateRangeInvalid) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {debouncedSearch ? (
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : null}
              {debouncedSpecies ? (
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSpeciesFilter("")}>
                  Clear species filter
                </Button>
              ) : null}
              {debouncedDateFrom || debouncedDateTo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setDateFromBs("");
                    setDateToBs("");
                  }}
                >
                  Clear date range
                </Button>
              ) : null}
            </div>
          )}
          {!hasActiveFilters && !dateRangeInvalid && canCreateFromThisList && (
            <Link href={createCaseHref}>
              <Button size="sm" className="gap-1.5 h-9">
                <ClipboardPlus className="w-3.5 h-3.5" />
                Register Case
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
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
                  className="transition-colors hover:bg-accent/50 motion-reduce:transition-none"
                >
                  {/*
                    Mobile-tightened card:
                      - Padding: `p-3` even when not in compact mode (saves
                        space without losing readability).
                      - Body and action area always stack on mobile (we used
                        to flex-row at xs which forced the buttons to share
                        a too-narrow gutter beside the text).
                      - Action row on mobile = two equal-width buttons in a
                        grid, matching the welcome-page pattern so Preview
                        and Delete are visually balanced.
                  */}
                  <CardContent className={compactCards ? "p-3" : "p-3 sm:p-4"}>
                    <div
                      className={
                        compactCards
                          ? "flex flex-col sm:flex-row items-start justify-between gap-2 sm:gap-3"
                          : "flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4"
                      }
                    >
                      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0 w-full">
                        {isAdmin && (
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
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

                      <div className={
                        isAdmin
                          ? "grid grid-cols-2 gap-2 w-full sm:flex sm:flex-col sm:items-end sm:w-auto shrink-0"
                          : "flex w-full sm:w-auto shrink-0"
                      }>
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
    </StickyScrollPage>
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
          These cases will be permanently removed from the system. This cannot be undone. To confirm, type{" "}
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
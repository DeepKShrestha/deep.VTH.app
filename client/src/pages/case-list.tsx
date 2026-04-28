import { useState } from "react";
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
} from "lucide-react";
import { Trash2 } from "lucide-react";
import { formatBsDate } from "@/lib/nepali-date";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function CaseList() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: cases, isLoading } = useQuery<Case[]>({
    queryKey: ["/api/cases"],
  });

  const deleteCaseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cases/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Case deleted" });
    },
  });

  const filtered = (cases || []).filter((c) => {
    const q = search.toLowerCase();
    return (
      c.caseNumber.toLowerCase().includes(q) ||
      c.ownerName.toLowerCase().includes(q) ||
      c.species.toLowerCase().includes(q) ||
      c.breed.toLowerCase().includes(q) ||
      (c.ownerPhone && c.ownerPhone.includes(q)) ||
      (c.billNumber && c.billNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold" data-testid="text-page-title">
            Previous Cases
          </h1>
        </div>
        <Link href="/register" className="w-full sm:w-auto">
          <Button size="sm" className="gap-1.5" data-testid="button-new-case">
            <ClipboardPlus className="w-3.5 h-3.5" />
            New Case
          </Button>
        </Link>
      </div>

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
              {search ? "No matching cases" : "No cases yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {search
                ? "Try a different search term."
                : "Register your first AST case to get started."}
            </p>
          </div>
          {!search && (
            <Link href="/register">
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
                    await Promise.all(
                      selectedIds.map((id) =>
                        apiRequest("DELETE", `/api/cases/${id}`)
                      )
                    );
                    setSelectedIds([]);
                    queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
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
                        <Link href={`/cases/${c.id}`} className="w-full sm:w-auto">
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
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

type MasterItem = {
  id: number;
  name: string;
  [key: string]: unknown;
};

const PUBLIC_ENDPOINT_BY_ADMIN_LIST: Record<string, string> = {
  "/api/admin/medications": "/api/medications",
  "/api/admin/routes-of-administration": "/api/routes-of-administration",
  "/api/admin/frequencies": "/api/frequencies",
  "/api/admin/dose-units": "/api/dose-units",
  "/api/admin/durations": "/api/durations",
};

export function TreatmentMasterDataManager({
  title,
  listEndpoint,
  createEndpoint,
  updateEndpointBase,
  deleteEndpointBase,
  moveEndpointBase,
  secondaryFieldLabel,
  secondaryFieldApiKey,
  secondaryFieldPlaceholder,
  secondaryFieldSearchKeys,
  nameOptional = false,
  secondaryFieldOptional = false,
  backHref = "/new-case/settings/treatment",
  createPlaceholder,
  searchPlaceholder,
  prependBody,
}: {
  title: string;
  listEndpoint: string;
  createEndpoint: string;
  updateEndpointBase: string;
  deleteEndpointBase: string;
  moveEndpointBase?: string;
  secondaryFieldLabel?: string;
  secondaryFieldApiKey?: string;
  secondaryFieldPlaceholder?: string;
  secondaryFieldSearchKeys?: string[];
  nameOptional?: boolean;
  /** When true with a secondary field, class/abbreviation may be left blank. */
  secondaryFieldOptional?: boolean;
  backHref?: string;
  createPlaceholder: string;
  searchPlaceholder: string;
  prependBody?: ReactNode;
}) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newSecondaryValue, setNewSecondaryValue] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSecondaryValue, setEditingSecondaryValue] = useState("");

  const secondaryRequired = Boolean(secondaryFieldApiKey) && !secondaryFieldOptional;

  const publicListEndpoint = PUBLIC_ENDPOINT_BY_ADMIN_LIST[listEndpoint];

  const { data: items = [] } = useQuery<MasterItem[]>({
    queryKey: [listEndpoint],
    queryFn: async () => {
      const freshUrl = `${listEndpoint}${listEndpoint.includes("?") ? "&" : "?"}t=${Date.now()}`;
      const res = await apiRequest("GET", freshUrl);
      return res.json();
    },
  });

  const getSecondaryFieldValue = (item: MasterItem): string => {
    if (!secondaryFieldApiKey) return "";
    const direct = item[secondaryFieldApiKey];
    if (typeof direct === "string" && direct.trim()) return direct;
    if (secondaryFieldApiKey === "shortCode") {
      const alt = item.short_code;
      if (typeof alt === "string" && alt.trim()) return alt;
    }
    if (secondaryFieldApiKey === "abbreviation") {
      const alt = item.abbreviation;
      if (typeof alt === "string" && alt.trim()) return alt;
    }
    if (secondaryFieldApiKey === "abbreviation" && typeof item.shortCode === "string") {
      return item.shortCode;
    }
    if (secondaryFieldApiKey === "shortCode" && typeof item.abbreviation === "string") {
      return item.abbreviation;
    }
    if (secondaryFieldApiKey === "medicationClass") {
      const snake = item.medication_class;
      if (typeof snake === "string" && snake.trim()) return snake;
      return "";
    }
    return item.name ?? "";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const keys = secondaryFieldSearchKeys && secondaryFieldSearchKeys.length > 0
      ? secondaryFieldSearchKeys
      : secondaryFieldApiKey === "medicationClass"
        ? ["medicationClass", "medication_class"]
        : secondaryFieldApiKey
          ? [secondaryFieldApiKey]
          : [];
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      return keys.some((key) => String(item[key] ?? "").toLowerCase().includes(q));
    });
  }, [items, search, secondaryFieldApiKey, secondaryFieldSearchKeys]);

  const searchActive = search.trim().length > 0;

  const addMutation = useMutation({
    mutationFn: async ({
      name,
      secondaryValue,
    }: {
      name: string;
      secondaryValue?: string;
    }) => {
      const payload: Record<string, unknown> = { name };
      if (secondaryFieldApiKey) {
        payload[secondaryFieldApiKey] = secondaryValue ?? "";
      }
      return apiRequest("POST", createEndpoint, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listEndpoint] });
      await queryClient.refetchQueries({ queryKey: [listEndpoint] });
      if (publicListEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [publicListEndpoint] });
        await queryClient.refetchQueries({ queryKey: [publicListEndpoint] });
      }
      setNewName("");
      setNewSecondaryValue("");
      toast({ title: `${title} saved` });
    },
    onError: (error: unknown) => {
      toast({
        title: `Failed to save ${title.toLowerCase()}`,
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      secondaryValue,
    }: {
      id: number;
      name: string;
      secondaryValue?: string;
    }) => {
      const payload: Record<string, unknown> = { name };
      if (secondaryFieldApiKey) {
        payload[secondaryFieldApiKey] = secondaryValue ?? "";
      }
      return apiRequest("PATCH", `${updateEndpointBase}/${id}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listEndpoint] });
      await queryClient.refetchQueries({ queryKey: [listEndpoint] });
      if (publicListEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [publicListEndpoint] });
        await queryClient.refetchQueries({ queryKey: [publicListEndpoint] });
      }
      setEditingId(null);
      setEditingName("");
      setEditingSecondaryValue("");
      toast({ title: `${title} updated` });
    },
    onError: (error: unknown) => {
      toast({
        title: `Failed to update ${title.toLowerCase()}`,
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `${deleteEndpointBase}/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listEndpoint] });
      await queryClient.refetchQueries({ queryKey: [listEndpoint] });
      if (publicListEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [publicListEndpoint] });
        await queryClient.refetchQueries({ queryKey: [publicListEndpoint] });
      }
      toast({ title: `${title} entry deleted` });
    },
    onError: (error: unknown) => {
      toast({
        title: `Failed to delete ${title.toLowerCase()} entry`,
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      apiRequest("PATCH", `${moveEndpointBase}/${id}/move`, { direction }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listEndpoint] });
      await queryClient.refetchQueries({ queryKey: [listEndpoint] });
      if (publicListEndpoint) {
        await queryClient.invalidateQueries({ queryKey: [publicListEndpoint] });
        await queryClient.refetchQueries({ queryKey: [publicListEndpoint] });
      }
    },
  });

  return (
    <StickyScrollPage
      maxWidthClass="max-w-5xl"
      contentPaddingClass="py-8"
      bodyClassName="space-y-6"
      sticky={
        <div className="space-y-4">
          <div className="space-y-1">
            <PageBreadcrumbs
              items={[
                { label: "Hospital", href: "/new-case" },
                { label: "Settings", href: "/new-case/settings" },
                { label: "Treatment data", href: backHref },
                { label: title },
              ]}
            />
            <div className="mt-2 flex items-center gap-3">
              <Link href={backHref}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div className="space-y-1 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground">Manage records for {title.toLowerCase()}.</p>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <Input
              className="h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
            />
            {searchActive && moveEndpointBase ? (
              <p className="text-xs text-muted-foreground">
                Clear search to use reorder arrows (order follows the full list).
              </p>
            ) : null}
          </div>
        </div>
      }
    >
      {prependBody}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add New</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <Input
              className="h-9"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={createPlaceholder}
            />
            {secondaryFieldApiKey && (
              <Input
                className="h-9"
                value={newSecondaryValue}
                onChange={(e) => setNewSecondaryValue(e.target.value)}
                placeholder={secondaryFieldPlaceholder || secondaryFieldLabel || "Abbreviation"}
              />
            )}
            <Button
              size="sm"
              className="h-9 gap-1.5 shrink-0 sm:self-end"
              onClick={() =>
                addMutation.mutate({
                  name: newName.trim(),
                  secondaryValue: newSecondaryValue.trim(),
                })
              }
              disabled={
                (!nameOptional && !newName.trim()) ||
                (secondaryRequired && !newSecondaryValue.trim()) ||
                addMutation.isPending
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/15 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {searchActive ? "No records match your search." : "No records yet."}
              </p>
              {searchActive ? (
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : (
                <Link href={backHref}>
                  <Button type="button" variant="outline" size="sm" className="h-9">
                    Back to treatment settings
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="max-h-[min(70vh,36rem)] overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                  <tr className="bg-muted/40 border-b">
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    {secondaryFieldApiKey && (
                      <th className="text-left px-3 py-2 font-medium">{secondaryFieldLabel || "Abbreviation"}</th>
                    )}
                    <th className="text-right px-3 py-2 font-medium w-[220px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const fullIndex = items.findIndex((i) => i.id === item.id);
                    return (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        {editingId === item.id ? (
                          <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                        ) : (
                          item.name
                        )}
                      </td>
                      {secondaryFieldApiKey && (
                        <td className="px-3 py-2">
                          {editingId === item.id ? (
                            <Input
                              value={editingSecondaryValue}
                              onChange={(e) => setEditingSecondaryValue(e.target.value)}
                              placeholder={secondaryFieldLabel || "Abbreviation"}
                            />
                          ) : (
                            getSecondaryFieldValue(item)
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === item.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: item.id,
                                    name: editingName.trim(),
                                    secondaryValue: editingSecondaryValue.trim(),
                                  })
                                }
                                disabled={
                                  (!nameOptional && !editingName.trim()) ||
                                  (secondaryRequired && !editingSecondaryValue.trim()) ||
                                  updateMutation.isPending
                                }
                              >
                                <Save className="w-3.5 h-3.5" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingName("");
                                  setEditingSecondaryValue("");
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditingName(item.name);
                                  setEditingSecondaryValue(getSecondaryFieldValue(item));
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                              {moveEndpointBase && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => moveMutation.mutate({ id: item.id, direction: "up" })}
                                    disabled={
                                      moveMutation.isPending ||
                                      searchActive ||
                                      fullIndex <= 0
                                    }
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 w-8 p-0"
                                    onClick={() => moveMutation.mutate({ id: item.id, direction: "down" })}
                                    disabled={
                                      moveMutation.isPending ||
                                      searchActive ||
                                      fullIndex < 0 ||
                                      fullIndex >= items.length - 1
                                    }
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending}>
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </StickyScrollPage>
  );
}

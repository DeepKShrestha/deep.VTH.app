import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Veterinarian } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StickyScrollPage } from "@/components/sticky-scroll-page";

export default function HospitalVeterinariansPage() {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [nvcRegistrationNumber, setNvcRegistrationNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Veterinarian | null>(null);

  const { data: veterinarians = [], isLoading } = useQuery<Veterinarian[]>({
    queryKey: ["/api/admin/veterinarians"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/veterinarians");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/veterinarians", {
        fullName: fullName.trim(),
        nvcRegistrationNumber: nvcRegistrationNumber.trim(),
        department: department.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/veterinarians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/veterinarians"] });
      setFullName("");
      setNvcRegistrationNumber("");
      setDepartment("");
      toast({ title: "Veterinarian added" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not add veterinarian",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/veterinarians/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/veterinarians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/veterinarians"] });
      setDeleteTarget(null);
      toast({ title: "Veterinarian removed" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not remove veterinarian",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleAdd = () => {
    if (!fullName.trim() || !nvcRegistrationNumber.trim() || !department.trim()) {
      toast({
        title: "All fields are required",
        description: "Enter name, NVC registration number, and department.",
        variant: "destructive",
      });
      return;
    }
    addMutation.mutate();
  };

  return (
    <StickyScrollPage
      maxWidthClass="max-w-3xl"
      contentPaddingClass="py-3 sm:py-5"
      bodyClassName="space-y-3 sm:space-y-4"
      sticky={
        <div className="flex items-center gap-3">
          <Link href="/new-case/settings">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Veterinarians</h1>
            <p className="text-sm text-muted-foreground">
              Manage attending veterinarians for hospital case registration (name, NVC no., department).
            </p>
          </div>
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add veterinarian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="vet-name">Full name</Label>
              <Input
                id="vet-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Veterinarian name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vet-nvc">Nepal Veterinary Council registration no.</Label>
              <Input
                id="vet-nvc"
                value={nvcRegistrationNumber}
                onChange={(e) => setNvcRegistrationNumber(e.target.value)}
                placeholder="NVC registration number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vet-dept">Department</Label>
              <Input
                id="vet-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Department"
              />
            </div>
          </div>
          <Button
            type="button"
            className="gap-1.5"
            onClick={handleAdd}
            disabled={addMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            {addMutation.isPending ? "Saving…" : "Add veterinarian"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saved veterinarians</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : veterinarians.length === 0 ? (
            <p className="text-sm text-muted-foreground">No veterinarians yet.</p>
          ) : (
            <ul className="divide-y rounded border">
              {veterinarians.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 text-sm"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium truncate">{v.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      NVC no.: {v.nvcRegistrationNumber} · {v.department}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1 text-destructive border-destructive/30"
                    onClick={() => setDeleteTarget(v)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove veterinarian?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.fullName}</span> from the
              catalog. Existing cases keep their saved veterinarian details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StickyScrollPage>
  );
}

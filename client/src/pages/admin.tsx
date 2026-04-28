import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowLeft, ArrowUp, Download, Plus, Trash2, UserCheck, UserX, Users, Clock } from "lucide-react";
import type { SafeUser, DownloadRequest, PasswordResetRequest } from "@shared/schema";
type FormEditLog = {
  id: number;
  actorUserId: number;
  actorRole: string;
  actorName: string;
  action: string;
  targetKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

const DEFAULT_BUILTIN_QUESTIONS = [
  { sectionTitle: "Owner Information", key: "ownerName", label: "Owner Name" },
  { sectionTitle: "Owner Information", key: "ownerPhone", label: "Phone Number" },
  { sectionTitle: "Owner Information", key: "ownerAddress", label: "Address" },
  { sectionTitle: "Animal Information", key: "species", label: "Species" },
  { sectionTitle: "Animal Information", key: "breed", label: "Breed" },
  { sectionTitle: "Animal Information", key: "animalName", label: "Animal Name" },
  { sectionTitle: "Animal Information", key: "age", label: "Age" },
  { sectionTitle: "Animal Information", key: "sex", label: "Sex" },
  { sectionTitle: "Sample Information", key: "sampleType", label: "Sample Type" },
  { sectionTitle: "Sample Information", key: "sampleDate", label: "Sample Collection Date (BS)" },
  { sectionTitle: "Sample Information", key: "cultureResult", label: "Culture / Organism Isolated" },
  { sectionTitle: "General Remarks", key: "remarks", label: "General Remarks" },
];

function designationLabel(d: string) {
  const map: Record<string, string> = {
    veterinarian: "Veterinarian",
    lab_assistant: "Lab Assistant",
    intern: "Intern",
    student: "Student",
  };
  return map[d] || d;
}

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    superadmin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    staff: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    intern: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    student: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    pending: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };
  const labels: Record<string, string> = {
    superadmin: "Super Admin",
    admin: "Admin",
    staff: "Staff",
    intern: "Intern",
    student: "Student",
    pending: "Pending",
  };
  return <Badge className={`${colors[role] || colors.pending} border-0 text-xs`}>{labels[role] || role}</Badge>;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [passwordResetNotes, setPasswordResetNotes] = useState<Record<number, string>>({});
  const [newSpeciesName, setNewSpeciesName] = useState("");
  const [selectedBreedSpecies, setSelectedBreedSpecies] = useState("");
  const [newBreedName, setNewBreedName] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newQuestionLabelBySection, setNewQuestionLabelBySection] = useState<Record<string, string>>({});
  const [newQuestionTypeBySection, setNewQuestionTypeBySection] = useState<Record<string, string>>({});
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    address: "",
    phone: "",
    email: "",
    username: "",
    designation: "",
  });

  const { data: allUsers = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });
  const { data: speciesOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/species-options"],
  });
  const { data: formDefinition } = useQuery<{
    sections: Array<{
      key: string;
      title: string;
      displayOrder: number;
      questions: Array<{
        id: number;
        key: string;
        label: string;
        inputType: string;
        enabled: boolean;
        required: boolean;
        displayOrder: number;
        isBuiltin: boolean;
      }>;
    }>;
  }>({
    queryKey: ["/api/admin/form-definition"],
  });
  const { data: breedOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/breed-options", selectedBreedSpecies],
    queryFn: async () => {
      if (!selectedBreedSpecies.trim()) return [];
      const res = await apiRequest(
        "GET",
        `/api/admin/breed-options?species=${encodeURIComponent(selectedBreedSpecies)}`,
      );
      return res.json();
    },
    enabled: Boolean(selectedBreedSpecies.trim()),
  });
  const { data: formEditLogs = [] } = useQuery<FormEditLog[]>({
    queryKey: ["/api/admin/form-edit-logs"],
  });

  useEffect(() => {
    if (!selectedBreedSpecies) return;
    const stillExists = speciesOptions.some((s) => s.name === selectedBreedSpecies);
    if (!stillExists) setSelectedBreedSpecies("");
  }, [speciesOptions, selectedBreedSpecies]);

  const { data: downloadRequests = [] } = useQuery<(DownloadRequest & { userName: string; userDesignation: string })[]>({
    queryKey: ["/api/admin/download-requests"],
  });
  const {
    data: passwordResetRequests = [],
    error: passwordResetError,
  } = useQuery<
    (PasswordResetRequest & {
      userName: string;
      userUsername: string;
      userRole: string;
    })[]
  >({
    queryKey: ["/api/admin/password-reset-requests"],
  });

  const pendingUsers = allUsers.filter((u) => !u.approved);
  const approvedUsers = allUsers.filter((u) => u.approved);
  const pendingDlRequests = downloadRequests.filter((r) => r.status === "pending");
  const pendingPasswordResets = passwordResetRequests.filter(
    (r) => r.status === "pending",
  );

  const approveMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("POST", `/api/admin/users/${id}/approve`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User approved" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User removed" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      fullName: string;
      address: string;
      phone: string;
      email: string;
      username: string;
      designation: string;
    }) => {
      const { id, ...rest } = data;
      await apiRequest("PATCH", `/api/admin/users/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({
        title: err?.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const resolveDlMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("POST", `/api/admin/download-requests/${id}/resolve`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/download-requests"] });
      toast({ title: "Request resolved" });
    },
  });
  const resolvePasswordResetMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      resolverNote,
    }: {
      id: number;
      status: string;
      resolverNote?: string;
    }) => {
      await apiRequest("POST", `/api/admin/password-reset-requests/${id}/resolve`, {
        status,
        resolverNote: resolverNote || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/password-reset-requests"],
      });
      toast({ title: "Password reset request resolved" });
      setPasswordResetNotes({});
    },
  });

  const addSpeciesMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/admin/species-options", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/species-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/species-options"] });
      setNewSpeciesName("");
      toast({ title: "Species added" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to add species",
        variant: "destructive",
      });
    },
  });

  const deleteSpeciesMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/species-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/species-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/species-options"] });
      toast({ title: "Species removed" });
    },
  });
  const addBreedMutation = useMutation({
    mutationFn: async (payload: { species: string; name: string }) => {
      await apiRequest("POST", "/api/admin/breed-options", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breed-options", selectedBreedSpecies],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/breed-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-edit-logs"] });
      setNewBreedName("");
      toast({ title: "Breed added" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to add breed",
        variant: "destructive",
      });
    },
  });
  const deleteBreedMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/breed-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/breed-options", selectedBreedSpecies],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/breed-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-edit-logs"] });
      toast({ title: "Breed removed" });
    },
  });

  const addSectionMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/admin/form-sections", { title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
      setNewSectionTitle("");
      toast({ title: "Section added" });
    },
  });

  const moveSectionMutation = useMutation({
    mutationFn: async (payload: { key: string; direction: "up" | "down" }) => {
      await apiRequest("PATCH", `/api/admin/form-sections/${payload.key}/move`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (payload: {
      sectionKey: string;
      label: string;
      inputType: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/form-questions", payload);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
      setNewQuestionLabelBySection((prev) => ({ ...prev, [vars.sectionKey]: "" }));
      toast({ title: "Question added" });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; enabled?: boolean; required?: boolean }) => {
      await apiRequest("PATCH", `/api/admin/form-questions/${payload.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
      toast({ title: "Question updated" });
    },
  });

  const moveQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; direction: "up" | "down" }) => {
      await apiRequest("PATCH", `/api/admin/form-questions/${payload.id}/move`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-definition"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-admin-title">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users and permissions</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Users className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <div className="text-2xl font-bold">{approvedUsers.length}</div>
            <p className="text-xs text-muted-foreground">Active Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{pendingUsers.length}</div>
            <p className="text-xs text-muted-foreground">Pending Signups</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Download className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-2xl font-bold">{pendingDlRequests.length}</div>
            <p className="text-xs text-muted-foreground">Download Requests</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingUsers.length})
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            All Users ({approvedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="downloads" data-testid="tab-downloads">
            Downloads ({pendingDlRequests.length})
          </TabsTrigger>
          <TabsTrigger value="password-resets" data-testid="tab-password-resets">
            Password Resets ({pendingPasswordResets.length})
          </TabsTrigger>
          <TabsTrigger value="form-options" data-testid="tab-form-options">
            Edit Form
          </TabsTrigger>
        </TabsList>

        {/* Pending Signups */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending signup requests</p>
          ) : (
            pendingUsers.map((u) => (
              <Card key={u.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        @{u.username} &middot; {u.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {designationLabel(u.designation)} &middot; {u.phone} &middot; {u.address}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => {
                          const role =
                            u.designation === "student"
                              ? "student"
                              : u.designation === "intern"
                                ? "intern"
                                : "staff";
                          approveMutation.mutate({ id: u.id, role });
                        }}
                        data-testid={`button-approve-${u.id}`}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => rejectMutation.mutate(u.id)}
                        data-testid={`button-reject-${u.id}`}
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

          {/* All Users */}
        <TabsContent value="users" className="space-y-3 mt-4">
          {approvedUsers.map((u) => (
            <Card key={u.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{u.fullName}</span>
                      {roleBadge(u.role)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      @{u.username} &middot; {designationLabel(u.designation)} &middot; {u.email}
                    </div>
                  </div>

                  {u.id !== currentUser?.id && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(currentUser?.role === "superadmin" || !["superadmin", "admin"].includes(u.role)) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => {
                            setEditingUser(u);
                            setEditForm({
                              fullName: u.fullName,
                              address: u.address,
                              phone: u.phone,
                              email: u.email,
                              username: u.username,
                              designation: u.designation,
                            });
                          }}
                        >
                          Edit
                        </Button>
                      )}

                      {(currentUser?.role === "superadmin" || !["superadmin", "admin"].includes(u.role)) ? (
                        <Select
                          value={u.role}
                          onValueChange={(role) => changeRoleMutation.mutate({ id: u.id, role })}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs" data-testid={`select-role-${u.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currentUser?.role === "superadmin" && (
                              <>
                                <SelectItem value="superadmin">Super Admin</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </>
                            )}
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="intern">Intern</SelectItem>
                            <SelectItem value="student">Student</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        roleBadge(u.role)
                      )}

                      {(currentUser?.role === "superadmin" || !["superadmin", "admin"].includes(u.role)) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700 h-8"
                          onClick={() => rejectMutation.mutate(u.id)}
                          data-testid={`button-delete-user-${u.id}`}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}

                  {u.id === currentUser?.id && (
                    <span className="text-xs text-muted-foreground italic">You</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Download Requests */}
        <TabsContent value="downloads" className="space-y-3 mt-4">
          {downloadRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No download requests yet</p>
          ) : (
            downloadRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.userName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {designationLabel(r.userDesignation)}
                        {r.dateFrom && ` \u00b7 From: ${r.dateFrom}`}
                        {r.dateTo && ` \u00b7 To: ${r.dateTo}`}
                      </div>
                      {r.reason && (
                        <div className="text-xs text-muted-foreground mt-1">Reason: {r.reason}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                     {r.status === "pending" ? (
  <>
    <Button
      size="sm"
      variant="outline"
      className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
      onClick={() => resolveDlMutation.mutate({ id: r.id, status: "approved" })}
      data-testid={`button-approve-dl-${r.id}`}
    >
      Approve
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
      onClick={() => resolveDlMutation.mutate({ id: r.id, status: "rejected" })}
      data-testid={`button-reject-dl-${r.id}`}
    >
      Reject
    </Button>
  </>
) : (
  <Badge
    className={`border-0 text-xs ${
      r.status === "approved" || r.status === "downloaded"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-red-100 text-red-800"
    }`}
  >
    {r.status === "approved" && "Approved"}
    {r.status === "downloaded" && "Downloaded"}
    {r.status === "rejected" && "Rejected"}
  </Badge>
)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Password Reset Requests */}
        <TabsContent value="password-resets" className="space-y-3 mt-4">
          {passwordResetError && (
            <Card>
              <CardContent className="pt-4 pb-3 text-sm text-red-600">
                Failed to load password reset requests.
              </CardContent>
            </Card>
          )}
          {passwordResetRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No password reset requests
            </p>
          ) : (
            passwordResetRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {r.userName} (@{r.userUsername})
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Role: {r.userRole}
                      </div>
                      {r.reason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Reason: {r.reason}
                        </div>
                      )}
                      {r.status === "pending" ? (
                        <div className="mt-2 space-y-1.5">
                          <Label htmlFor={`reset-note-${r.id}`} className="text-xs">
                            Resolver note (optional)
                          </Label>
                          <Input
                            id={`reset-note-${r.id}`}
                            value={passwordResetNotes[r.id] || ""}
                            onChange={(e) =>
                              setPasswordResetNotes((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            placeholder="Reason for approve/reject action"
                          />
                        </div>
                      ) : r.resolverNote ? (
                        <div className="text-xs text-muted-foreground mt-1">
                          Resolver note: {r.resolverNote}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {r.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() =>
                              resolvePasswordResetMutation.mutate({
                                id: r.id,
                                status: "approved",
                                resolverNote: passwordResetNotes[r.id],
                              })
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() =>
                              resolvePasswordResetMutation.mutate({
                                id: r.id,
                                status: "rejected",
                                resolverNote: passwordResetNotes[r.id],
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Badge
                          className={`border-0 text-xs ${
                            r.status === "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {r.status === "approved" ? "Approved" : "Rejected"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="form-options" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Register Form Layout (Sections & Questions)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Add custom sections and questions, and rearrange them. Built-in questions can be hidden/required, and custom questions will appear in Register New Case.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  placeholder="Add section (e.g. Owner Details)"
                />
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addSectionMutation.mutate(newSectionTitle.trim())}
                  disabled={!newSectionTitle.trim() || addSectionMutation.isPending}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add section
                </Button>
              </div>

              {(formDefinition?.sections ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No server form-definition found yet. Built-in questions still available below.</p>
              ) : (
                <div className="space-y-3">
                  {(formDefinition?.sections ?? []).map((section, idx, arr) => (
                    <div key={section.key} className="rounded border">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{section.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            key: {section.key}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => moveSectionMutation.mutate({ key: section.key, direction: "up" })}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => moveSectionMutation.mutate({ key: section.key, direction: "down" })}
                            disabled={idx === arr.length - 1}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="sm:col-span-2">
                            <Input
                              value={newQuestionLabelBySection[section.key] || ""}
                              onChange={(e) =>
                                setNewQuestionLabelBySection((prev) => ({
                                  ...prev,
                                  [section.key]: e.target.value,
                                }))
                              }
                              placeholder="Add question (e.g. Owner Email)"
                            />
                          </div>
                          <Select
                            value={newQuestionTypeBySection[section.key] || "text"}
                            onValueChange={(v) =>
                              setNewQuestionTypeBySection((prev) => ({ ...prev, [section.key]: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="textarea">Long text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              addQuestionMutation.mutate({
                                sectionKey: section.key,
                                label: (newQuestionLabelBySection[section.key] || "").trim(),
                                inputType: newQuestionTypeBySection[section.key] || "text",
                              })
                            }
                            disabled={
                              !(newQuestionLabelBySection[section.key] || "").trim() ||
                              addQuestionMutation.isPending
                            }
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add question
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {(section.questions ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No questions in this section.</p>
                          ) : (
                            section.questions.map((q, qIdx) => (
                              <div
                                key={q.id}
                                className="flex items-center justify-between gap-2 rounded border px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm truncate">
                                    {q.label}{" "}
                                    {q.isBuiltin ? (
                                      <span className="text-xs text-muted-foreground">(built-in)</span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">(custom)</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    key: {q.key} · type: {q.inputType}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => moveQuestionMutation.mutate({ id: q.id, direction: "up" })}
                                    disabled={qIdx === 0}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => moveQuestionMutation.mutate({ id: q.id, direction: "down" })}
                                    disabled={qIdx === section.questions.length - 1}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={q.enabled ? "default" : "outline"}
                                    className="h-8"
                                    onClick={() =>
                                      updateQuestionMutation.mutate({
                                        id: q.id,
                                        enabled: !q.enabled,
                                        required: q.required,
                                      })
                                    }
                                  >
                                    {q.enabled ? "Visible" : "Hidden"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={q.required ? "default" : "outline"}
                                    className="h-8"
                                    onClick={() =>
                                      updateQuestionMutation.mutate({
                                        id: q.id,
                                        required: !q.required,
                                        enabled: q.enabled,
                                      })
                                    }
                                  >
                                    {q.required ? "Required" : "Optional"}
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Edit Existing Register Form Fields</CardTitle>
              <p className="text-xs text-muted-foreground">
                Classic controls for built-in fields: set each as shown/hidden and compulsory/optional.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(formDefinition?.sections ?? []).map((section) => {
                const builtinQuestions = (section.questions ?? []).filter((q) => q.isBuiltin);
                if (builtinQuestions.length === 0) return null;
                return (
                  <div key={`builtin-${section.key}`} className="space-y-2">
                    <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </h4>
                    {builtinQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between rounded border px-3 py-2"
                      >
                        <span className="text-sm">{q.label}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <Button
                            type="button"
                            size="sm"
                            variant={q.enabled ? "default" : "outline"}
                            className="h-7"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                enabled: !q.enabled,
                                required: q.required,
                              })
                            }
                          >
                            {q.enabled ? "Shown" : "Hidden"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={q.required ? "default" : "outline"}
                            className="h-7"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                required: !q.required,
                                enabled: q.enabled,
                              })
                            }
                          >
                            {q.required ? "Compulsory" : "Optional"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {(formDefinition?.sections ?? []).length === 0 && (
                <div className="space-y-2">
                  {DEFAULT_BUILTIN_QUESTIONS.map((q) => (
                    <div
                      key={q.key}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <span className="text-sm">{q.sectionTitle} - {q.label}</span>
                      <span className="text-xs text-muted-foreground">
                        Restart server once to restore editable toggles for this field
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Edit Register Form: Species</CardTitle>
              <p className="text-xs text-muted-foreground">
                Controls species values used in Register New Case. This is kept in
                Admin Panel so case entry users can register cases without form
                configuration controls in the same screen.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newSpeciesName}
                  onChange={(e) => setNewSpeciesName(e.target.value)}
                  placeholder="Add species (e.g. Camelid)"
                />
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addSpeciesMutation.mutate(newSpeciesName.trim())}
                  disabled={!newSpeciesName.trim() || addSpeciesMutation.isPending}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {speciesOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No species configured.</p>
                ) : (
                  speciesOptions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <span className="text-sm">{s.name}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => deleteSpeciesMutation.mutate(s.id)}
                        data-testid={`button-delete-species-${s.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Edit Register Form: Breeds by Species</CardTitle>
              <p className="text-xs text-muted-foreground">
                Manage breed dropdown options for each species. Users can still choose "Other" and type manually.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Species</Label>
                <Select value={selectedBreedSpecies} onValueChange={setSelectedBreedSpecies}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select species to manage breeds" />
                  </SelectTrigger>
                  <SelectContent>
                    {speciesOptions.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newBreedName}
                  onChange={(e) => setNewBreedName(e.target.value)}
                  placeholder="Add breed (e.g. Belgian Malinois)"
                  disabled={!selectedBreedSpecies}
                />
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    addBreedMutation.mutate({
                      species: selectedBreedSpecies.trim(),
                      name: newBreedName.trim(),
                    })
                  }
                  disabled={
                    !selectedBreedSpecies.trim() || !newBreedName.trim() || addBreedMutation.isPending
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
              {!selectedBreedSpecies ? (
                <p className="text-xs text-muted-foreground">
                  Select a species first to view and edit breed options.
                </p>
              ) : (
                <div className="space-y-2">
                  {breedOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No breeds configured for this species.</p>
                  ) : (
                    breedOptions.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded border px-3 py-2"
                      >
                        <span className="text-sm">{b.name}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => deleteBreedMutation.mutate(b.id)}
                          data-testid={`button-delete-breed-${b.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAuditLog((v) => !v)}
            >
              {showAuditLog ? "Hide Form Edit Audit Log" : "Show Form Edit Audit Log"}
            </Button>
          </div>

          {showAuditLog && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Form Edit Audit Log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {formEditLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No edits recorded yet.</p>
                ) : (
                  formEditLogs.slice(0, 30).map((log) => (
                    <div key={log.id} className="rounded border px-3 py-2 text-xs">
                      <div className="font-medium">
                        {log.actorName} ({log.actorRole}) - {log.action}
                      </div>
                      <div className="text-muted-foreground">
                        Target: {log.targetKey || "n/a"} |{" "}
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      {editingUser && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              Edit User – {editingUser.fullName} (ID: {editingUser.id})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-fullName">Full Name</Label>
                <Input
                  id="edit-fullName"
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, username: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-designation">Designation</Label>
                <Input
                  id="edit-designation"
                  value={editForm.designation}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, designation: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-2"
                disabled={updateUserMutation.isPending}
                onClick={() => {
                  if (!editingUser) return;
                  updateUserMutation.mutate({
                    id: editingUser.id,
                    ...editForm,
                  });
                }}
              >
                {updateUserMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

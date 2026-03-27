import { useState } from "react";
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
import { ArrowLeft, UserCheck, UserX, Download, Shield, Users, Clock } from "lucide-react";
import type { SafeUser, DownloadRequest } from "@shared/schema";

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
    student: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    pending: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };
  const labels: Record<string, string> = {
    superadmin: "Super Admin",
    admin: "Admin",
    staff: "Staff",
    student: "Student",
    pending: "Pending",
  };
  return <Badge className={`${colors[role] || colors.pending} border-0 text-xs`}>{labels[role] || role}</Badge>;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
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

  const { data: downloadRequests = [] } = useQuery<(DownloadRequest & { userName: string; userDesignation: string })[]>({
    queryKey: ["/api/admin/download-requests"],
  });

  const pendingUsers = allUsers.filter((u) => !u.approved);
  const approvedUsers = allUsers.filter((u) => u.approved);
  const pendingDlRequests = downloadRequests.filter((r) => r.status === "pending");

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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingUsers.length})
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            All Users ({approvedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="downloads" data-testid="tab-downloads">
            Downloads ({pendingDlRequests.length})
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
                          const role = u.designation === "student" ? "student" : "staff";
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
                        <Badge className={`border-0 text-xs ${
                          r.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {r.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
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

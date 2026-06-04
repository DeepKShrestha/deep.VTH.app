import { forwardRef, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { formatOrdinalBatch } from "@shared/ordinal-batch";
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
import { Switch } from "@/components/ui/switch";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  HardDrive,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  Users,
  Clock,
  Copy,
  X,
} from "lucide-react";
import type { SafeUser, DownloadRequest, PasswordResetRequest } from "@shared/schema";
import { adToBs } from "@/lib/nepali-date";
import { AdminSiteBackupPanel } from "@/components/admin-site-backup-panel";
import { UserAvatar } from "@/components/user-avatar";
import { PasswordResetIdCardPreview } from "@/components/password-reset-id-card-preview";
import { StickyScrollPage } from "@/components/sticky-scroll-page";
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


type AdminFormDefinition = {
  sections: Array<{
    key: string;
    title: string;
    displayOrder: number;
    questions: Array<{
      id: number;
      key: string;
      label: string;
      inputType: string;
      options?: string[];
      enabled: boolean;
      required: boolean;
      hideLabel?: boolean;
      displayOrder: number;
      isBuiltin: boolean;
    }>;
  }>;
};

type AdminUser = SafeUser & {
  activeNow?: boolean;
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
const AST_HOSPITAL_ONLY_QUESTION_KEYWORDS = [
  "history",
  "previousmedication",
  "testsuggested",
  "vital",
  "temperature",
  "heartrate",
  "respiratoryrate",
  "respirationrate",
  "resprate",
  "rumenmotility",
  "dehydration",
  "crt",
  "capillaryrefilltime",
  "flock",
  "hatchery",
  "feedsupplier",
  "feedintake",
  "waterintake",
  "mortality",
];

function normalizeAstKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isHospitalOnlyQuestionInAstEditor(question: { key: string; label: string }): boolean {
  const normalizedKey = normalizeAstKey(question.key || "");
  const normalizedLabel = normalizeAstKey(question.label || "");
  return AST_HOSPITAL_ONLY_QUESTION_KEYWORDS.some(
    (keyword) => normalizedKey.includes(keyword) || normalizedLabel.includes(keyword),
  );
}

function isHospitalOnlySectionInAstEditor(section: { key: string; title: string }): boolean {
  const normalizedKey = normalizeAstKey(section.key || "");
  const normalizedTitle = normalizeAstKey(section.title || "");
  return (
    normalizedKey === "history" ||
    normalizedKey === "avian" ||
    normalizedKey === "vitals" ||
    normalizedKey === "testssuggested" ||
    normalizedKey === "testsuggested" ||
    normalizedTitle.includes("historyandpreviousmedication") ||
    normalizedTitle.includes("avianinformation") ||
    normalizedTitle.includes("vitals") ||
    normalizedTitle.includes("testsuggested")
  );
}

function designationLabel(d: string) {
  const map: Record<string, string> = {
    veterinarian: "Veterinarian",
    lab_assistant: "Lab Assistant",
    intern: "Intern",
    student: "Student",
  };
  return map[d] || d;
}

function requestSourceLabel(source: string | null | undefined) {
  return source === "hospital_case" ? "Hospital Case" : "AST Report";
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

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export default function AdminPanel({
  forcedTab,
  mode = "full",
}: {
  forcedTab?: string;
  mode?: "full" | "form-only";
} = {}) {
  const [astEditorPanel, setAstEditorPanel] = useState<
    "layout" | "fields" | "species" | null
  >("layout");
  const [openLayoutSectionKey, setOpenLayoutSectionKey] = useState<string | null>(null);
  const [openFieldSectionKey, setOpenFieldSectionKey] = useState<string | null>(null);
  const [openCatalogPanel, setOpenCatalogPanel] = useState<"species" | "breeds" | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const search = useSearch();
  const { toast } = useToast();
  const { user: currentUser, updateCurrentUser, isSuperAdmin } = useAuth();
  const initialTabFromUrl = useMemo(() => {
    if (forcedTab) return forcedTab;
    const rawSearch = (search || "").replace(/^\?/, "");
    if (!rawSearch) return mode === "form-only" ? "form-options" : "pending";
    const tab = new URLSearchParams(rawSearch).get("tab");
    const allowed =
      mode === "form-only"
        ? ["form-options"]
        : [
            "pending",
            "users",
            "downloads",
            "password-resets",
            "access-control",
            ...(isSuperAdmin ? ["backup", "audit-log"] : []),
            "form-options",
          ];
    return tab && allowed.includes(tab) ? tab : mode === "form-only" ? "form-options" : "pending";
  }, [forcedTab, search, mode, isSuperAdmin]);
  const [activeTab, setActiveTab] = useState(initialTabFromUrl);
  useEffect(() => {
    setActiveTab(initialTabFromUrl);
  }, [initialTabFromUrl]);
  useEffect(() => {
    if (mode !== "full") return;
    if ((activeTab === "backup" || activeTab === "audit-log") && !isSuperAdmin)
      setActiveTab("pending");
  }, [activeTab, isSuperAdmin, mode]);
  useEffect(() => {
    if (mode !== "form-only") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const insideCollapsible = target.closest("[data-editor-collapsible='true']");
      const insideRoot = editorRootRef.current?.contains(target);
      if (insideRoot && !insideCollapsible) {
        setOpenLayoutSectionKey(null);
        setOpenFieldSectionKey(null);
        setOpenCatalogPanel(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mode]);
  useEffect(() => {
    if (mode !== "form-only") return;
    setOpenLayoutSectionKey(null);
    setOpenFieldSectionKey(null);
    setOpenCatalogPanel(null);
  }, [astEditorPanel, mode]);
  const backHref = mode === "form-only" ? "/ast-report/settings" : "/";
  const pageTitle = mode === "form-only" ? "AST Form Editor" : "Admin Panel";
  const pageSubtitle =
    mode === "form-only"
      ? "Manage AST form layout, fields, and options."
      : "Manage users and permissions";
  const formScope = mode === "form-only" ? "ast" : "hospital";

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const editFormContainerRef = useRef<HTMLDivElement | null>(null);
  const [passwordResetNotes, setPasswordResetNotes] = useState<Record<number, string>>({});
  const [newSpeciesName, setNewSpeciesName] = useState("");
  const [selectedBreedSpecies, setSelectedBreedSpecies] = useState("");
  const [newBreedName, setNewBreedName] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newQuestionLabelBySection, setNewQuestionLabelBySection] = useState<Record<string, string>>({});
  const [newQuestionTypeBySection, setNewQuestionTypeBySection] = useState<Record<string, string>>({});
  const [newQuestionOptionsBySection, setNewQuestionOptionsBySection] = useState<Record<string, string>>({});
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showPasswordResetLogs, setShowPasswordResetLogs] = useState(false);
  const [showDownloadLogs, setShowDownloadLogs] = useState(false);
  const [passwordResetLogsFilter, setPasswordResetLogsFilter] = useState("");
  const [downloadLogsFilter, setDownloadLogsFilter] = useState("");
  const [downloadSourceFilter, setDownloadSourceFilter] = useState<"all" | "ast_report" | "hospital_case">("all");
  const [usersFilter, setUsersFilter] = useState("");
  const [studentBatchFilter, setStudentBatchFilter] = useState<string>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(() => new Set());
  /** When true, All Users shows row checkboxes and bulk delete controls (works with search and batch filter). */
  const [usersMultiSelectMode, setUsersMultiSelectMode] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: "",
    address: "",
    phone: "",
    email: "",
    username: "",
    designation: "",
  });

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [usersFilter, studentBatchFilter]);

  useEffect(() => {
    if (activeTab !== "users") {
      setUsersMultiSelectMode(false);
      setSelectedUserIds(new Set());
    }
  }, [activeTab]);

  const { data: allUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: mode === "full",
    refetchInterval: mode === "full" ? 5000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const { data: speciesOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/species-options"],
  });
  const { data: formDefinition } = useQuery<AdminFormDefinition>({
    queryKey: ["/api/admin/form-definition", formScope],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/form-definition?scope=${formScope}`);
      return res.json();
    },
  });
  const { data: dashboardVisibility = [] } = useQuery<
    Array<{ role: string; dashboardVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/dashboard"],
    enabled: mode === "full",
  });
  const { data: vthDashboardVisibility = [] } = useQuery<
    Array<{ role: string; dashboardVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/vth-dashboard"],
    enabled: mode === "full",
  });
  const { data: astExportVisibility = [] } = useQuery<
    Array<{ role: string; exportVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/ast-export"],
    enabled: mode === "full",
  });
  const { data: hospitalExportVisibility = [] } = useQuery<
    Array<{ role: string; exportVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/hospital-export"],
    enabled: mode === "full",
  });
  // Per-role admin toggles for "can register a new case" in each module.
  // The shape mirrors the export endpoints so the same renderRoleRow helper
  // can reuse the layout without an inheritance dance.
  const { data: astRegisterVisibility = [] } = useQuery<
    Array<{ role: string; registerVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/ast-register"],
    enabled: mode === "full",
  });
  const { data: hospitalRegisterVisibility = [] } = useQuery<
    Array<{ role: string; registerVisible: boolean }>
  >({
    queryKey: ["/api/admin/feature-visibility/hospital-register"],
    enabled: mode === "full",
  });
  // Per-batch register overrides. The endpoint returns the list of known
  // student batches (distinct values from users.student_batch) paired with
  // their current toggle. Newly enrolled batches just inherit the role
  // decision — they don't need a row here to work.
  const { data: astBatchVisibilityResponse } = useQuery<{
    scope: string;
    items: Array<{ batch: number; registerVisible: boolean }>;
  }>({
    queryKey: ["/api/admin/feature-visibility/register-batches", "ast"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/admin/feature-visibility/register-batches?scope=ast",
      );
      return res.json();
    },
    enabled: mode === "full",
  });
  const { data: hospitalBatchVisibilityResponse } = useQuery<{
    scope: string;
    items: Array<{ batch: number; registerVisible: boolean }>;
  }>({
    queryKey: ["/api/admin/feature-visibility/register-batches", "hospital"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/admin/feature-visibility/register-batches?scope=hospital",
      );
      return res.json();
    },
    enabled: mode === "full",
  });
  const astBatchVisibility = astBatchVisibilityResponse?.items ?? [];
  const hospitalBatchVisibility = hospitalBatchVisibilityResponse?.items ?? [];
  /**
   * Admin-curated canonical batch list. Drives the signup dropdown (via
   * the public `/api/student-batches` endpoint) AND the rows that show
   * up in the per-batch register override cards below. `inUseByUsers`
   * lets the admin see how many active accounts a batch represents
   * before removing it — purely informational, not a hard block.
   */
  const { data: studentBatchesResponse, refetch: refetchStudentBatches } = useQuery<{
    items: Array<{ batch: number; inUseByUsers: number }>;
  }>({
    queryKey: ["/api/admin/student-batches"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/student-batches");
      return res.json();
    },
    enabled: mode === "full",
  });
  const studentBatches = studentBatchesResponse?.items ?? [];
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

  const { data: downloadRequests = [] } = useQuery<
    (DownloadRequest & {
      requestSource?: string;
      userName: string;
      userUsername?: string;
      userDesignation: string;
      resolverName?: string;
    })[]
  >({
    queryKey: ["/api/admin/download-requests"],
    enabled: mode === "full",
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const {
    data: passwordResetRequests = [],
    error: passwordResetError,
  } = useQuery<
    (Omit<PasswordResetRequest, "passwordHash" | "idCardFilename"> & {
      hasIdCard?: boolean;
      userName: string;
      userUsername: string;
      userRole: string;
      resolverName?: string;
    })[]
  >({
    queryKey: ["/api/admin/password-reset-requests"],
    enabled: mode === "full",
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (mode !== "full") return;
    if (activeTab === "password-resets") {
      queryClient.refetchQueries({ queryKey: ["/api/admin/password-reset-requests"] });
      return;
    }
    if (activeTab === "downloads") {
      queryClient.refetchQueries({ queryKey: ["/api/admin/download-requests"] });
      return;
    }
    if (activeTab === "pending") {
      queryClient.refetchQueries({ queryKey: ["/api/admin/users"] });
      return;
    }
    if (activeTab === "backup") {
      queryClient.refetchQueries({ queryKey: ["/api/admin/backup/settings"] });
      queryClient.refetchQueries({ queryKey: ["/api/admin/backup/local-files"] });
      queryClient.refetchQueries({ queryKey: ["/api/admin/backup/history"] });
    }
  }, [activeTab, mode]);

  const pendingUsers = allUsers.filter((u) => !u.approved);
  const scopedFormSections = (formDefinition?.sections ?? [])
    .filter((section) =>
      mode === "form-only" ? !isHospitalOnlySectionInAstEditor(section) : true,
    )
    .map((section) => ({
      ...section,
      questions:
        mode === "form-only"
          ? (section.questions ?? []).filter(
              (question) => !isHospitalOnlyQuestionInAstEditor(question),
            )
          : section.questions ?? [],
    }));
  const approvedUsers = allUsers.filter((u) => u.approved);
  const availableStudentBatches = Array.from(
    new Set(
      approvedUsers
        .filter((u) => u.designation === "student" && Number.isInteger(u.studentBatch))
        .map((u) => Number(u.studentBatch)),
    ),
  ).sort((a, b) => a - b);
  const normalizedUsersFilter = usersFilter.trim().toLowerCase();
  const filteredApprovedUsers = approvedUsers.filter((u) => {
    if (studentBatchFilter !== "all") {
      const batchNum = Number.parseInt(studentBatchFilter, 10);
      if (u.designation !== "student" || u.studentBatch !== batchNum) return false;
    }
    if (!normalizedUsersFilter) return true;
    return (
      u.fullName.toLowerCase().includes(normalizedUsersFilter) ||
      u.username.toLowerCase().includes(normalizedUsersFilter) ||
      u.email.toLowerCase().includes(normalizedUsersFilter) ||
      (u.designation === "student" && `${u.studentBatch ?? ""}`.includes(normalizedUsersFilter))
    );
  });
  const deletableFilteredUsers = useMemo(
    () =>
      filteredApprovedUsers.filter((u) => {
        if (!currentUser || u.id === currentUser.id) return false;
        if (currentUser.role === "superadmin") return true;
        return u.role !== "superadmin" && u.role !== "admin";
      }),
    [filteredApprovedUsers, currentUser],
  );
  const sourceMatches = (r: { requestSource?: string }) =>
    downloadSourceFilter === "all" || (r.requestSource || "ast_report") === downloadSourceFilter;
  const pendingDlRequests = downloadRequests.filter((r) => r.status === "pending" && sourceMatches(r));
  const resolvedDownloadLogs = downloadRequests.filter((r) => r.status !== "pending" && sourceMatches(r));
  const normalizedDownloadLogsFilter = downloadLogsFilter.trim().toLowerCase();
  const filteredResolvedDownloadLogs = resolvedDownloadLogs.filter((r) => {
    if (!normalizedDownloadLogsFilter) return true;
    return (
      r.userName.toLowerCase().includes(normalizedDownloadLogsFilter) ||
      String(r.userUsername || "")
        .toLowerCase()
        .includes(normalizedDownloadLogsFilter)
    );
  });
  const pendingPasswordResets = passwordResetRequests.filter(
    (r) => r.status === "pending",
  );
  const resolvedPasswordResetLogs = passwordResetRequests.filter(
    (r) => r.status === "approved" || r.status === "rejected",
  );
  const normalizedPasswordResetLogsFilter = passwordResetLogsFilter.trim().toLowerCase();
  const filteredResolvedPasswordResetLogs = resolvedPasswordResetLogs.filter((r) => {
    if (!normalizedPasswordResetLogsFilter) return true;
    return (
      r.userName.toLowerCase().includes(normalizedPasswordResetLogsFilter) ||
      String(r.userUsername || "")
        .toLowerCase()
        .includes(normalizedPasswordResetLogsFilter)
    );
  });

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
  const bulkDeleteUsersMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/admin/users/bulk-delete", { ids });
      return res.json() as Promise<{
        message?: string;
        deletedCount: number;
        skipped?: { id: number; reason: string }[];
      }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUserIds(new Set());
      const skipped = result.skipped?.length ?? 0;
      toast({
        title: result?.message || "Users removed",
        description:
          skipped > 0
            ? `${skipped} account(s) were skipped (e.g. protected admin or not found).`
            : undefined,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Bulk delete failed",
        variant: "destructive",
      });
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

  const totpEnforcementMutation = useMutation({
    mutationFn: async ({ id, enforced }: { id: number; enforced: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/totp-enforcement`, {
        enforced,
      });
      return res.json() as Promise<AdminUser>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Two-factor requirement updated" });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.serverMessage || err.message : "Update failed";
      toast({ title: msg, variant: "destructive" });
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

  useEffect(() => {
    if (!editingUser) return;
    const frame = requestAnimationFrame(() => {
      editFormContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingUser?.id]);

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

  const syncFormDefinitionViews = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/form-definition", formScope] });
    await queryClient.refetchQueries({ queryKey: ["/api/admin/form-definition", formScope] });
    await queryClient.invalidateQueries({ queryKey: ["/api/form-definition", formScope] });
    await queryClient.invalidateQueries({ queryKey: ["/api/admin/form-edit-logs"] });
  };

  const addSectionMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/admin/form-sections", { title, scope: formScope });
      return res.json();
    },
    onSuccess: async () => {
      await syncFormDefinitionViews();
      setNewSectionTitle("");
      toast({ title: "Section added" });
    },
  });

  const moveSectionMutation = useMutation({
    mutationFn: async (payload: { key: string; direction: "up" | "down" }) => {
      await apiRequest("PATCH", `/api/admin/form-sections/${payload.key}/move`, { ...payload, scope: formScope });
    },
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (payload: {
      sectionKey: string;
      label: string;
      inputType: string;
      options?: string[];
    }) => {
      const res = await apiRequest("POST", "/api/admin/form-questions", { ...payload, scope: formScope });
      return res.json();
    },
    onSuccess: async (_data, vars) => {
      await syncFormDefinitionViews();
      setNewQuestionLabelBySection((prev) => ({ ...prev, [vars.sectionKey]: "" }));
      setNewQuestionOptionsBySection((prev) => ({ ...prev, [vars.sectionKey]: "" }));
      toast({ title: "Question added" });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; enabled?: boolean; required?: boolean; hideLabel?: boolean }) => {
      await apiRequest("PATCH", `/api/admin/form-questions/${payload.id}`, { ...payload, scope: formScope });
    },
    onSuccess: async () => {
      await syncFormDefinitionViews();
      toast({ title: "Question updated" });
    },
  });

  const moveQuestionMutation = useMutation({
    mutationFn: async (payload: { id: number; direction: "up" | "down" }) => {
      await apiRequest("PATCH", `/api/admin/form-questions/${payload.id}/move`, { ...payload, scope: formScope });
    },
    onSuccess: async () => {
      await syncFormDefinitionViews();
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionKey: string) => {
      const res = await apiRequest("DELETE", `/api/admin/form-sections/${sectionKey}?scope=${formScope}`);
      return res.json() as Promise<{ deletedKey?: string }>;
    },
    onSuccess: async (data, sectionKey) => {
      const deletedKey = data?.deletedKey || sectionKey;
      queryClient.setQueryData<AdminFormDefinition | undefined>(
        ["/api/admin/form-definition", formScope],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sections: prev.sections.filter((s) => s.key !== deletedKey),
          };
        },
      );
      await syncFormDefinitionViews();
      toast({ title: "Section deleted" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to delete section",
        variant: "destructive",
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/form-questions/${questionId}?scope=${formScope}`);
      return res.json() as Promise<{ deletedId?: number }>;
    },
    onSuccess: async (data, questionId) => {
      const deletedId = data?.deletedId ?? questionId;
      queryClient.setQueryData<AdminFormDefinition | undefined>(
        ["/api/admin/form-definition", formScope],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sections: prev.sections.map((s) => ({
              ...s,
              questions: s.questions.filter((q) => q.id !== deletedId),
            })),
          };
        },
      );
      await syncFormDefinitionViews();
      toast({ title: "Question deleted" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to delete question",
        variant: "destructive",
      });
    },
  });

  const updateDashboardVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; dashboardVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/dashboard/${encodeURIComponent(payload.role)}`,
        { dashboardVisible: payload.dashboardVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/dashboard"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          dashboardVisible: vars.dashboardVisible,
          astDashboardVisible: vars.dashboardVisible,
        } as typeof currentUser);
      }
      toast({ title: "Dashboard visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update visibility",
        variant: "destructive",
      });
    },
  });
  const updateVthDashboardVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; dashboardVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/vth-dashboard/${encodeURIComponent(payload.role)}`,
        { dashboardVisible: payload.dashboardVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/vth-dashboard"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          vthDashboardVisible: vars.dashboardVisible,
        } as typeof currentUser);
      }
      toast({ title: "VTH dashboard visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update VTH visibility",
        variant: "destructive",
      });
    },
  });
  const updateAstExportVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; exportVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/ast-export/${encodeURIComponent(payload.role)}`,
        { exportVisible: payload.exportVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/ast-export"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          astExportVisible: vars.exportVisible,
        } as typeof currentUser);
      }
      toast({ title: "AST export visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update AST export visibility",
        variant: "destructive",
      });
    },
  });
  const updateHospitalExportVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; exportVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/hospital-export/${encodeURIComponent(payload.role)}`,
        { exportVisible: payload.exportVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/hospital-export"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          hospitalExportVisible: vars.exportVisible,
        } as typeof currentUser);
      }
      toast({ title: "Hospital export visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update Hospital export visibility",
        variant: "destructive",
      });
    },
  });

  /**
   * Register-visibility mutations. Same shape as the export ones; they
   * also push the resolved value into the local `currentUser` cache so
   * the "Register a new case" button on the welcome page flips state
   * instantly without waiting for a re-login. The server still has the
   * final word on the actual POST.
   */
  const updateAstRegisterVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; registerVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/ast-register/${encodeURIComponent(payload.role)}`,
        { registerVisible: payload.registerVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/ast-register"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          astRegisterVisible: vars.registerVisible,
        } as typeof currentUser);
      }
      toast({ title: "AST registration visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update AST registration visibility",
        variant: "destructive",
      });
    },
  });
  const updateHospitalRegisterVisibilityMutation = useMutation({
    mutationFn: async (payload: { role: string; registerVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/hospital-register/${encodeURIComponent(payload.role)}`,
        { registerVisible: payload.registerVisible },
      );
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/hospital-register"],
      });
      if (currentUser?.role === vars.role && currentUser) {
        updateCurrentUser({
          ...currentUser,
          hospitalRegisterVisible: vars.registerVisible,
        } as typeof currentUser);
      }
      toast({ title: "Hospital registration visibility updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update Hospital registration visibility",
        variant: "destructive",
      });
    },
  });
  const updateAstBatchVisibilityMutation = useMutation({
    mutationFn: async (payload: { batch: number; registerVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/register-batches/ast/${payload.batch}`,
        { registerVisible: payload.registerVisible },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "ast"],
      });
      toast({ title: "AST batch override updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update AST batch override",
        variant: "destructive",
      });
    },
  });
  const updateHospitalBatchVisibilityMutation = useMutation({
    mutationFn: async (payload: { batch: number; registerVisible: boolean }) => {
      await apiRequest(
        "PATCH",
        `/api/admin/feature-visibility/register-batches/hospital/${payload.batch}`,
        { registerVisible: payload.registerVisible },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "hospital"],
      });
      toast({ title: "Hospital batch override updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to update Hospital batch override",
        variant: "destructive",
      });
    },
  });
  const addStudentBatchMutation = useMutation({
    mutationFn: async (batch: number) => {
      await apiRequest("POST", "/api/admin/student-batches", { batch });
    },
    onSuccess: () => {
      // Invalidate both the canonical list AND the per-batch override
      // lists so the new batch shows up in the BatchOverrideRow grids
      // without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-batches"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "ast"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "hospital"],
      });
      toast({ title: "Batch added" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to add batch",
        variant: "destructive",
      });
    },
  });
  const removeStudentBatchMutation = useMutation({
    mutationFn: async (batch: number) => {
      await apiRequest("DELETE", `/api/admin/student-batches/${batch}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-batches"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "ast"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/feature-visibility/register-batches", "hospital"],
      });
      toast({ title: "Batch removed" });
    },
    onError: (err: unknown) => {
      toast({
        title: err instanceof Error ? err.message : "Failed to remove batch",
        variant: "destructive",
      });
    },
  });

  const downloadUsersCsv = () => {
    const headers = ["Name", "Username", "Address", "Phone", "Email", "Role", "Designation", "Student Batch", "Status"];
    const rows = filteredApprovedUsers.map((u) => [
      u.fullName,
      u.username,
      u.address,
      u.phone,
      u.email,
      u.role,
      designationLabel(u.designation),
      u.designation === "student" && u.studentBatch ? formatOrdinalBatch(u.studentBatch) : "",
      u.approved ? "Approved" : "Pending",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const formatAdDateTime = (isoDate: string | null | undefined): string => {
    if (!isoDate) return "-";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const formatBsDateTime = (isoDate: string | null | undefined): string => {
    if (!isoDate) return "-";
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "-";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const bsDate = adToBs(`${y}-${m}-${d}`) || "-";
    const time = date.toLocaleTimeString();
    return `${bsDate} ${time}`;
  };
  const formatAdBsDateTime = (isoDate: string | null | undefined): string => {
    const ad = formatAdDateTime(isoDate);
    const bs = formatBsDateTime(isoDate);
    if (ad === "-" || bs === "-") return "-";
    return `${ad} | ${bs}`;
  };
  const formatDateParts = (isoDate: string | null | undefined): { adBsDate: string; time: string } => {
    if (!isoDate) return { adBsDate: "-", time: "-" };
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return { adBsDate: "-", time: "-" };
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const adDate = `${y}-${m}-${d}`;
    const bsDate = adToBs(adDate) || "-";
    return {
      adBsDate: `${adDate} | ${bsDate}`,
      time: dt.toLocaleTimeString(),
    };
  };

  const downloadPasswordResetLogsCsv = () => {
    const headers = [
      "Full Name",
      "Username",
      "Decision",
      "Resolved By",
      "Resolved At (AD | BS)",
      "Resolver Note",
    ];
    const rows = filteredResolvedPasswordResetLogs.map((r) => [
      r.userName,
      r.userUsername,
      r.status === "approved" ? "Approved" : "Rejected",
      r.resolverName || (r.resolvedBy ? `User ${r.resolvedBy}` : ""),
      formatAdBsDateTime(r.resolvedAt),
      r.resolverNote || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `password-reset-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadDownloadLogsCsv = () => {
    const headers = [
      "Full Name",
      "Username",
      "Source",
      "Decision",
      "Requested At (AD | BS)",
      "Resolved By",
      "Resolved At (AD | BS)",
      "Admin Note",
    ];
    const rows = filteredResolvedDownloadLogs.map((r) => [
      r.userName,
      r.userUsername || "",
      requestSourceLabel(r.requestSource),
      r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Downloaded",
      formatAdBsDateTime(r.createdAt),
      r.resolverName || (r.resolvedBy ? `User ${r.resolvedBy}` : ""),
      formatAdBsDateTime(r.resolvedAt),
      r.adminNote || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `download-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <StickyScrollPage
      ref={editorRootRef}
      maxWidthClass="max-w-6xl"
      bodyClassName="space-y-5"
      sticky={
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-admin-title">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
        </div>
      </div>
      }
    >

      {/* Summary cards */}
      {mode === "full" && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {mode === "full" && (
        <TabsList className="w-full h-auto flex overflow-x-auto gap-1 whitespace-nowrap p-1">
          <TabsTrigger className="shrink-0 text-xs sm:text-sm" value="pending" data-testid="tab-pending">
            Pending ({pendingUsers.length})
          </TabsTrigger>
          <TabsTrigger className="shrink-0 text-xs sm:text-sm" value="users" data-testid="tab-users">
            All Users ({approvedUsers.length})
          </TabsTrigger>
          <TabsTrigger className="shrink-0 text-xs sm:text-sm" value="downloads" data-testid="tab-downloads">
            Downloads ({pendingDlRequests.length})
          </TabsTrigger>
          <TabsTrigger className="shrink-0 text-xs sm:text-sm" value="password-resets" data-testid="tab-password-resets">
            Password Resets ({pendingPasswordResets.length})
          </TabsTrigger>
          <TabsTrigger className="shrink-0 text-xs sm:text-sm" value="access-control" data-testid="tab-access-control">
            Access Control
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger
              className="shrink-0 text-xs sm:text-sm"
              value="backup"
              data-testid="tab-backup"
            >
              <HardDrive className="w-3.5 h-3.5 mr-1 inline" />
              Backup
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger
              className="shrink-0 text-xs sm:text-sm"
              value="audit-log"
              data-testid="tab-audit-log"
            >
              <Clock className="w-3.5 h-3.5 mr-1 inline" />
              Audit Log
            </TabsTrigger>
          )}
        </TabsList>
        )}

        {/* Pending Signups */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">No pending signup requests.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setActiveTab("users")}
              >
                Go to All Users
              </Button>
            </div>
          ) : (
            pendingUsers.map((u) => (
              <Card key={u.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{u.fullName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        @{u.username} &middot; {u.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {designationLabel(u.designation)} &middot; {u.phone} &middot; {u.address}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
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
                        className="h-9 gap-1 text-red-600 border-red-200 hover:bg-red-50"
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
              <Input
                value={usersFilter}
                onChange={(e) => setUsersFilter(e.target.value)}
                placeholder="Search by name, username, email, or batch"
                data-testid="input-users-filter"
                className="h-9 sm:max-w-sm"
              />
              <Select value={studentBatchFilter} onValueChange={setStudentBatchFilter}>
                <SelectTrigger className="w-[150px] h-9 text-xs" data-testid="select-student-batch-filter">
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All batches</SelectItem>
                  {availableStudentBatches.map((batch) => (
                    <SelectItem key={batch} value={String(batch)}>
                      {formatOrdinalBatch(batch)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!usersMultiSelectMode ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs shrink-0"
                  onClick={() => setUsersMultiSelectMode(true)}
                  data-testid="button-users-multi-select-mode"
                >
                  Select multiple
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs shrink-0"
                    onClick={() => {
                      setUsersMultiSelectMode(false);
                      setSelectedUserIds(new Set());
                    }}
                    data-testid="button-users-multi-select-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs"
                    disabled={deletableFilteredUsers.length === 0 || bulkDeleteUsersMutation.isPending}
                    onClick={() =>
                      setSelectedUserIds(new Set(deletableFilteredUsers.map((u) => u.id)))
                    }
                    data-testid="button-select-visible-users"
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    disabled={selectedUserIds.size === 0 || bulkDeleteUsersMutation.isPending}
                    onClick={() => {
                      const ids = Array.from(selectedUserIds);
                      const ok = window.confirm(
                        `Permanently delete ${ids.length} selected account(s)? Their sessions will end immediately. This cannot be undone.`,
                      );
                      if (!ok) return;
                      bulkDeleteUsersMutation.mutate(ids);
                    }}
                    data-testid="button-bulk-delete-users"
                  >
                    {selectedUserIds.size === 0
                      ? "Delete"
                      : `Delete (${selectedUserIds.size})`}
                  </Button>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 shrink-0"
              onClick={downloadUsersCsv}
              disabled={filteredApprovedUsers.length === 0}
              data-testid="button-download-users-csv"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </Button>
          </div>
          {filteredApprovedUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                {normalizedUsersFilter || studentBatchFilter !== "all"
                  ? "No users match your current search or batch filter."
                  : "No approved users to show yet."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {normalizedUsersFilter ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setUsersFilter("")}
                  >
                    Clear search
                  </Button>
                ) : null}
                {studentBatchFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setStudentBatchFilter("all")}
                  >
                    Show all batches
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setActiveTab("pending")}
                >
                  View pending signups
                </Button>
              </div>
            </div>
          ) : (
            filteredApprovedUsers.map((u) => (
              <Card key={u.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div
                      className={`flex flex-1 min-w-0 items-start gap-3`}
                    >
                      {usersMultiSelectMode &&
                        (() => {
                          const canSelect =
                            currentUser &&
                            u.id !== currentUser.id &&
                            (currentUser.role === "superadmin" ||
                              (u.role !== "superadmin" && u.role !== "admin"));
                          return canSelect ? (
                            <input
                              type="checkbox"
                              className="mt-1.5 h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
                              checked={selectedUserIds.has(u.id)}
                              onChange={() => {
                                setSelectedUserIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(u.id)) next.delete(u.id);
                                  else next.add(u.id);
                                  return next;
                                });
                              }}
                              aria-label={`Select ${u.fullName}`}
                              data-testid={`checkbox-select-user-${u.id}`}
                            />
                          ) : (
                            <span
                              className="mt-1.5 h-4 w-4 shrink-0 rounded border border-dashed border-muted-foreground/25 bg-muted/20"
                              title={
                                u.id === currentUser?.id
                                  ? "You cannot select your own account."
                                  : "This account cannot be selected for bulk delete with your role."
                              }
                              aria-hidden
                            />
                          );
                        })()}
                      {/*
                        Round avatar in front of each approved user — uses
                        the uploaded profile photo if any, otherwise the
                        person's initials, otherwise a generic person icon.
                        `mt-0.5` keeps it visually centred on the first
                        text line on both mobile and desktop; `shrink-0`
                        guarantees it never deforms even when the email/
                        designation row wraps on narrow phones.
                      */}
                      <UserAvatar
                        photoUrl={u.profilePhotoUrl}
                        name={u.fullName}
                        size={36}
                        tone="muted"
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{u.fullName}</span>
                        {roleBadge(u.role)}
                        <Badge
                          title="Active means this account had API activity in the last 3 minutes. The list refreshes about every 5 seconds. Closing the tab or browser marks the user offline quickly; signing out removes the session immediately."
                          className={`border-0 text-[10px] px-2 py-0.5 ${
                            u.activeNow
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {u.activeNow ? "Active" : "Offline"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        @{u.username} &middot; {designationLabel(u.designation)}
                        {u.designation === "student" && u.studentBatch
                          ? ` (${formatOrdinalBatch(u.studentBatch)})`
                          : ""}
                        {" \u00b7 "}
                        {u.email}
                      </div>
                    </div>
                    </div>

                    {(() => {
                      // Compute action visibility once so we can also gate
                      // the wrapper itself. Without this gate, a viewer
                      // with no available actions on a row (e.g. an admin
                      // looking at another admin) used to produce an empty
                      // action row that ate vertical space on mobile —
                      // particularly visible after we removed the
                      // duplicate role pill that used to sit inside it.
                      const canModifyRole =
                        currentUser?.role === "superadmin" ||
                        !["superadmin", "admin"].includes(u.role);
                      const canManage2FA = isSuperAdmin && u.role === "admin";
                      const hasAnyActions = canModifyRole || canManage2FA;
                      if (u.id === currentUser?.id || !hasAnyActions) return null;
                      return (
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                        {canModifyRole && (
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

                        {/*
                          Role changer — only rendered when the viewer
                          actually has permission to change this user's
                          role (superadmin can change anyone; admin can
                          change non-admins). When the viewer is read-only
                          for this row we intentionally render NOTHING
                          here: the same role badge already sits inline
                          with the user's name above, and showing it a
                          second time made the mobile card look like the
                          user had two role tags (see the duplicate "Admin"
                          and "Super Admin" pills users reported on phones).
                        */}
                        {canModifyRole && (
                          <Select
                            value={u.role}
                            onValueChange={(role) => changeRoleMutation.mutate({ id: u.id, role })}
                          >
                            <SelectTrigger
                              className="w-32 h-8 text-xs"
                              data-testid={`select-role-${u.id}`}
                            >
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
                        )}

                        {canManage2FA && (
                          <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                            <Label
                              htmlFor={`totp-enforce-${u.id}`}
                              className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer"
                            >
                              Require 2FA
                            </Label>
                            <Switch
                              id={`totp-enforce-${u.id}`}
                              checked={Boolean(u.totpEnforced)}
                              disabled={
                                totpEnforcementMutation.isPending ||
                                (!u.totpEnforced && !u.totpEnabled)
                              }
                              onCheckedChange={(enforced) => {
                                totpEnforcementMutation.mutate({ id: u.id, enforced });
                              }}
                              data-testid={`switch-totp-enforced-${u.id}`}
                            />
                          </div>
                        )}

                        {canModifyRole && (
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
                      );
                    })()}

                    {u.id === currentUser?.id && (
                      <span className="text-xs text-muted-foreground italic">You</span>
                    )}
                  </div>

                  {editingUser?.id === u.id && (
                    <AdminUserEditForm
                      ref={editFormContainerRef}
                      user={u}
                      editForm={editForm}
                      setEditForm={setEditForm}
                      isSaving={updateUserMutation.isPending}
                      onCancel={() => setEditingUser(null)}
                      onSave={() => {
                        updateUserMutation.mutate({
                          id: u.id,
                          ...editForm,
                        });
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Download Requests */}
        <TabsContent value="downloads" className="space-y-3 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="download-source-filter" className="text-xs text-muted-foreground">
                  Source
                </Label>
              <Select value={downloadSourceFilter} onValueChange={(v: "all" | "ast_report" | "hospital_case") => setDownloadSourceFilter(v)}>
                <SelectTrigger id="download-source-filter" className="h-9 w-40 text-xs" data-testid="select-download-source-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ast_report">AST Report</SelectItem>
                  <SelectItem value="hospital_case">Hospital Case</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setShowDownloadLogs((v) => !v)}
              data-testid="button-toggle-download-logs"
            >
              {showDownloadLogs ? "Hide Download Logs" : "View Download Logs"}
            </Button>
          </div>

          {showDownloadLogs && (
            <Card>
              <CardContent className="pt-3 pb-3">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <Input
                    value={downloadLogsFilter}
                    onChange={(e) => setDownloadLogsFilter(e.target.value)}
                    placeholder="Search by requester name or username"
                    className="h-9 sm:max-w-sm text-xs"
                    data-testid="input-download-logs-filter"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 shrink-0"
                    onClick={downloadDownloadLogsCsv}
                    disabled={filteredResolvedDownloadLogs.length === 0}
                    data-testid="button-download-download-logs-csv"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </Button>
                </div>
                {filteredResolvedDownloadLogs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/80 bg-muted/10 px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground">
                      {normalizedDownloadLogsFilter.trim()
                        ? "No log entries match your search."
                        : "No resolved download logs yet."}
                    </p>
                    {normalizedDownloadLogsFilter.trim() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setDownloadLogsFilter("")}
                      >
                        Clear log search
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-2 py-1.5 font-medium">Requester</th>
                          <th className="px-2 py-1.5 font-medium">Username</th>
                          <th className="px-2 py-1.5 font-medium">Source</th>
                          <th className="px-2 py-1.5 font-medium">Decision</th>
                          <th className="px-2 py-1.5 font-medium">Requested Date (AD | BS)</th>
                          <th className="px-2 py-1.5 font-medium">Requested Time</th>
                          <th className="px-2 py-1.5 font-medium">Approved/Resolved By</th>
                          <th className="px-2 py-1.5 font-medium">Approved/Resolved Date (AD | BS)</th>
                          <th className="px-2 py-1.5 font-medium">Approved/Resolved Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResolvedDownloadLogs.map((r) => {
                          const requested = formatDateParts(r.createdAt);
                          const resolved = formatDateParts(r.resolvedAt);
                          return (
                          <tr key={`download-log-${r.id}`} className="border-t align-top">
                            <td className="px-2 py-1.5">{r.userName || "-"}</td>
                            <td className="px-2 py-1.5">
                              {r.userUsername ? `@${r.userUsername}` : "-"}
                            </td>
                            <td className="px-2 py-1.5">{requestSourceLabel(r.requestSource)}</td>
                            <td className="px-2 py-1.5">
                              {r.status === "approved"
                                ? "Approved"
                                : r.status === "rejected"
                                  ? "Rejected"
                                  : "Downloaded"}
                            </td>
                            <td className="px-2 py-1.5">{requested.adBsDate}</td>
                            <td className="px-2 py-1.5">{requested.time}</td>
                            <td className="px-2 py-1.5">
                              {r.resolverName || (r.resolvedBy ? `User ${r.resolvedBy}` : "-")}
                            </td>
                            <td className="px-2 py-1.5">{resolved.adBsDate}</td>
                            <td className="px-2 py-1.5">{resolved.time}</td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {pendingDlRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No pending download requests for the selected source.
              </p>
              {downloadSourceFilter !== "all" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setDownloadSourceFilter("all")}
                >
                  Show all sources
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setShowDownloadLogs(true)}
                >
                  View resolved download logs
                </Button>
              )}
            </div>
          ) : (
            pendingDlRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.userName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {designationLabel(r.userDesignation)}
                        {` · ${requestSourceLabel(r.requestSource)}`}
                        {r.dateFrom && ` \u00b7 From: ${r.dateFrom}`}
                        {r.dateTo && ` \u00b7 To: ${r.dateTo}`}
                      </div>
                      {r.reason && (
                        <div className="text-xs text-muted-foreground mt-1">Reason: {r.reason}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                     {r.status === "pending" ? (
  <>
    <Button
      size="sm"
      variant="outline"
      className="h-9 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
      onClick={() => resolveDlMutation.mutate({ id: r.id, status: "approved" })}
      data-testid={`button-approve-dl-${r.id}`}
    >
      <UserCheck className="w-3.5 h-3.5" />
      Approve
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="h-9 gap-1 text-red-600 border-red-200 hover:bg-red-50"
      onClick={() => resolveDlMutation.mutate({ id: r.id, status: "rejected" })}
      data-testid={`button-reject-dl-${r.id}`}
    >
      <UserX className="w-3.5 h-3.5" />
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
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setShowPasswordResetLogs((v) => !v)}
              data-testid="button-toggle-reset-logs"
            >
              {showPasswordResetLogs ? "Hide Reset Logs" : "View Reset Logs"}
            </Button>
            {showPasswordResetLogs && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={downloadPasswordResetLogsCsv}
                disabled={resolvedPasswordResetLogs.length === 0}
                data-testid="button-download-reset-logs-csv"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </Button>
            )}
          </div>

          {showPasswordResetLogs && (
            <Card>
              <CardContent className="pt-3 pb-3">
                <div className="mb-2">
                  <Input
                    value={passwordResetLogsFilter}
                    onChange={(e) => setPasswordResetLogsFilter(e.target.value)}
                    placeholder="Search by requester name or username"
                    className="h-9 sm:max-w-sm text-xs"
                    data-testid="input-password-reset-logs-filter"
                  />
                </div>
                {filteredResolvedPasswordResetLogs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/80 bg-muted/10 px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground">
                      {normalizedPasswordResetLogsFilter.trim()
                        ? "No log entries match your search."
                        : "No resolved password reset logs yet."}
                    </p>
                    {normalizedPasswordResetLogsFilter.trim() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setPasswordResetLogsFilter("")}
                      >
                        Clear log search
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="px-2 py-1.5 font-medium">Full Name</th>
                          <th className="px-2 py-1.5 font-medium">Username</th>
                          <th className="px-2 py-1.5 font-medium">Decision</th>
                          <th className="px-2 py-1.5 font-medium">Resolved By</th>
                          <th className="px-2 py-1.5 font-medium">Resolved At (AD | BS)</th>
                          <th className="px-2 py-1.5 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResolvedPasswordResetLogs.map((r) => (
                          <tr key={`reset-log-${r.id}`} className="border-t align-top">
                            <td className="px-2 py-1.5">{r.userName}</td>
                            <td className="px-2 py-1.5">@{r.userUsername}</td>
                            <td className="px-2 py-1.5">
                              {r.status === "approved" ? "Approved" : "Rejected"}
                            </td>
                            <td className="px-2 py-1.5">
                              {r.resolverName || (r.resolvedBy ? `User ${r.resolvedBy}` : "-")}
                            </td>
                            <td className="px-2 py-1.5">{formatAdBsDateTime(r.resolvedAt)}</td>
                            <td className="px-2 py-1.5">{r.resolverNote || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {passwordResetError && (
            <Card>
              <CardContent className="pt-4 pb-3 text-sm text-red-600">
                Failed to load password reset requests.
              </CardContent>
            </Card>
          )}
          {passwordResetRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">No password reset requests right now.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setActiveTab("users")}
                >
                  Go to All Users
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setActiveTab("pending")}
                >
                  View pending signups
                </Button>
              </div>
            </div>
          ) : (
            passwordResetRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
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
                      <PasswordResetIdCardPreview
                        requestId={r.id}
                        hasIdCard={Boolean(r.hasIdCard)}
                        status={r.status}
                      />
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
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                      {r.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() =>
                              resolvePasswordResetMutation.mutate({
                                id: r.id,
                                status: "approved",
                                resolverNote: passwordResetNotes[r.id],
                              })
                            }
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() =>
                              resolvePasswordResetMutation.mutate({
                                id: r.id,
                                status: "rejected",
                                resolverNote: passwordResetNotes[r.id],
                              })
                            }
                          >
                            <UserX className="w-3.5 h-3.5" />
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

        <TabsContent value="access-control" className="space-y-3 mt-4">
          {/*
            The Access Control panel groups settings by MODULE (AST vs.
            Hospital) rather than by FEATURE so an admin configuring one
            module sees all of its toggles in one place. Each module card
            contains three compact sub-sections (Dashboard, Export, Register)
            laid out as label + horizontal role chips, and Register adds a
            per-batch override row for the student role.

            Each sub-section is a single inline row instead of a 3-column
            grid of large cards so the whole panel fits on a single
            laptop screen with room to spare — much denser than the
            previous four-card stack while still being scannable.

            The first card defines the canonical batch list itself: which
            batch numbers a new student can pick at signup. We render it
            ABOVE the module cards on purpose — the per-batch override
            rows in those cards read from this same list, so visually it
            reads top-down: "first decide what batches exist, then decide
            who can do what".
          */}
          <AllowedBatchesCard
            batches={studentBatches}
            onAdd={(batch) => addStudentBatchMutation.mutate(batch)}
            onRemove={(batch) => removeStudentBatchMutation.mutate(batch)}
            adding={addStudentBatchMutation.isPending}
            removing={removeStudentBatchMutation.isPending}
            onRefresh={() => {
              void refetchStudentBatches();
            }}
          />
          <ModuleAccessControlCard
            title="AST Module"
            description="Toggles below control AST module access for each role. Per-batch overrides under the Student row only further restrict — the role toggle is the master switch."
            dashboard={dashboardVisibility}
            onDashboardToggle={(role, dashboardVisible) =>
              updateDashboardVisibilityMutation.mutate({ role, dashboardVisible })
            }
            export_={astExportVisibility}
            onExportToggle={(role, exportVisible) =>
              updateAstExportVisibilityMutation.mutate({ role, exportVisible })
            }
            register={astRegisterVisibility}
            onRegisterToggle={(role, registerVisible) =>
              updateAstRegisterVisibilityMutation.mutate({ role, registerVisible })
            }
            batches={astBatchVisibility}
            onBatchToggle={(batch, registerVisible) =>
              updateAstBatchVisibilityMutation.mutate({ batch, registerVisible })
            }
          />
          <ModuleAccessControlCard
            title="Hospital Module"
            description="Toggles below control Hospital (VTH) module access for each role. Per-batch overrides under the Student row only further restrict — the role toggle is the master switch."
            dashboard={vthDashboardVisibility}
            onDashboardToggle={(role, dashboardVisible) =>
              updateVthDashboardVisibilityMutation.mutate({ role, dashboardVisible })
            }
            export_={hospitalExportVisibility}
            onExportToggle={(role, exportVisible) =>
              updateHospitalExportVisibilityMutation.mutate({ role, exportVisible })
            }
            register={hospitalRegisterVisibility}
            onRegisterToggle={(role, registerVisible) =>
              updateHospitalRegisterVisibilityMutation.mutate({ role, registerVisible })
            }
            batches={hospitalBatchVisibility}
            onBatchToggle={(batch, registerVisible) =>
              updateHospitalBatchVisibilityMutation.mutate({ batch, registerVisible })
            }
          />
          <p className="text-[11px] text-muted-foreground px-1">
            Note: users may need to log out and back in for a toggle change
            to take effect on their current session.
          </p>
        </TabsContent>

        {mode === "full" && isSuperAdmin && (
          <TabsContent value="backup" className="space-y-3 mt-4">
            <AdminSiteBackupPanel />
          </TabsContent>
        )}

        {mode === "full" && isSuperAdmin && (
          <TabsContent value="audit-log" className="space-y-3 mt-4">
            <AdminAuditLogPanel />
          </TabsContent>
        )}

        <TabsContent value="form-options" className="space-y-3 mt-4">
          {mode === "form-only" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AST Form Editor</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Choose a section to edit. This keeps the editor cleaner and easier to use.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={astEditorPanel === "layout" ? "default" : "outline"}
                    onClick={() =>
                      setAstEditorPanel((prev) => (prev === "layout" ? null : "layout"))
                    }
                  >
                    Form Layout (Sections & Questions)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={astEditorPanel === "fields" ? "default" : "outline"}
                    onClick={() =>
                      setAstEditorPanel((prev) => (prev === "fields" ? null : "fields"))
                    }
                  >
                    Edit Register Form Fields
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={astEditorPanel === "species" ? "default" : "outline"}
                    onClick={() =>
                      setAstEditorPanel((prev) => (prev === "species" ? null : "species"))
                    }
                  >
                    Species and Breed by Species
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {(mode !== "form-only" || astEditorPanel === "layout") && (
          <Card data-editor-collapsible="true">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Form Layout (Sections & Questions)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Add custom sections and questions, and rearrange them. Built-in questions can be hidden/required, and custom questions will appear in AST Case Registration.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
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

              {scopedFormSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No server form-definition found yet. Built-in questions still available below.</p>
              ) : (
                <div className="space-y-3">
                  {scopedFormSections.map((section, idx, arr) => (
                    <div key={section.key} className="rounded border" data-editor-collapsible="true">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-2 border-b">
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="text-sm font-medium truncate text-left hover:underline"
                            onClick={() =>
                              setOpenLayoutSectionKey((prev) =>
                                prev === section.key ? null : section.key,
                              )
                            }
                          >
                            {section.title}
                          </button>
                          <div className="text-xs text-muted-foreground truncate">
                            key: {section.key}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                          {!["owner", "animal", "sample", "ast", "final"].includes(section.key) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => deleteSectionMutation.mutate(section.key)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>

                      {openLayoutSectionKey === section.key && (
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
                              <SelectItem value="singleSelect">Dropdown (single)</SelectItem>
                              <SelectItem value="multiSelect">Multiple choice</SelectItem>
                              <SelectItem value="yesNo">Yes / No</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(newQuestionTypeBySection[section.key] === "singleSelect" ||
                          newQuestionTypeBySection[section.key] === "multiSelect") && (
                          <Input
                            value={newQuestionOptionsBySection[section.key] || ""}
                            onChange={(e) =>
                              setNewQuestionOptionsBySection((prev) => ({
                                ...prev,
                                [section.key]: e.target.value,
                              }))
                            }
                            placeholder="Options (comma separated), e.g. A+, B+, O+, AB+"
                          />
                        )}
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
                                options:
                                  (newQuestionTypeBySection[section.key] === "singleSelect" ||
                                    newQuestionTypeBySection[section.key] === "multiSelect")
                                    ? (newQuestionOptionsBySection[section.key] || "")
                                        .split(",")
                                        .map((v) => v.trim())
                                        .filter(Boolean)
                                    : [],
                              })
                            }
                            disabled={
                              !(newQuestionLabelBySection[section.key] || "").trim() ||
                              ((newQuestionTypeBySection[section.key] === "singleSelect" ||
                                newQuestionTypeBySection[section.key] === "multiSelect") &&
                                (newQuestionOptionsBySection[section.key] || "")
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean).length < 2) ||
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
                                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
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
                                    {q.options && q.options.length > 0
                                      ? ` · options: ${q.options.join(", ")}`
                                      : ""}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                                  {!q.isBuiltin && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                                      onClick={() => deleteQuestionMutation.mutate(q.id)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {(mode !== "form-only" || astEditorPanel === "fields") && (
          <Card data-editor-collapsible="true">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Edit Existing Register Form Fields</CardTitle>
              <p className="text-xs text-muted-foreground">
                Classic controls for built-in fields: set each as shown/hidden and compulsory/optional.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {scopedFormSections.map((section) => {
                const builtinQuestions = (section.questions ?? []).filter((q) => q.isBuiltin);
                if (builtinQuestions.length === 0) return null;
                return (
                  <div key={`builtin-${section.key}`} className="space-y-2" data-editor-collapsible="true">
                    <button
                      type="button"
                      className="w-full text-left text-xs uppercase tracking-wide text-muted-foreground rounded border px-3 py-2 hover:bg-muted/40"
                      onClick={() =>
                        setOpenFieldSectionKey((prev) =>
                          prev === section.key ? null : section.key,
                        )
                      }
                    >
                      {section.title}
                    </button>
                    {openFieldSectionKey === section.key && builtinQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
                      >
                        <span className="text-sm">{q.label}</span>
                        <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                          <Button
                            type="button"
                            size="sm"
                            variant={q.enabled ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
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
                            className="h-7 w-24 justify-center text-[11px]"
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
                          <Button
                            type="button"
                            size="sm"
                            variant={q.hideLabel ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                hideLabel: !q.hideLabel,
                                enabled: q.enabled,
                                required: q.required,
                              })
                            }
                          >
                            {q.hideLabel ? "Box only" : "Show label"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {scopedFormSections.length === 0 && (
                <div className="space-y-2">
                  {DEFAULT_BUILTIN_QUESTIONS.map((q) => (
                    <div
                      key={q.key}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <span className="text-sm">{q.sectionTitle} - {q.label}</span>
                      <span className="text-xs text-muted-foreground">
                        Loading field controls...
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {(mode !== "form-only" || astEditorPanel === "fields") && (
          <Card data-editor-collapsible="true">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Edit Custom Register Form Fields</CardTitle>
              <p className="text-xs text-muted-foreground">
                Central controls for custom questions: set each as shown/hidden and compulsory/optional.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {scopedFormSections.map((section) => {
                const customQuestions = (section.questions ?? []).filter((q) => !q.isBuiltin);
                if (customQuestions.length === 0) return null;
                return (
                  <div key={`custom-${section.key}`} className="space-y-2" data-editor-collapsible="true">
                    <button
                      type="button"
                      className="w-full text-left text-xs uppercase tracking-wide text-muted-foreground rounded border px-3 py-2 hover:bg-muted/40"
                      onClick={() =>
                        setOpenFieldSectionKey((prev) =>
                          prev === `custom-${section.key}` ? null : `custom-${section.key}`,
                        )
                      }
                    >
                      {section.title}
                    </button>
                    {openFieldSectionKey === `custom-${section.key}` && customQuestions.map((q) => (
                      <div
                        key={`custom-toggle-${q.id}`}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm truncate">{q.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            key: {q.key} · type: {q.inputType}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                          <Button
                            type="button"
                            size="sm"
                            variant={q.enabled ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
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
                            className="h-7 w-24 justify-center text-[11px]"
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
                          <Button
                            type="button"
                            size="sm"
                            variant={q.hideLabel ? "default" : "outline"}
                            className="h-7 w-24 justify-center text-[11px]"
                            onClick={() =>
                              updateQuestionMutation.mutate({
                                id: q.id,
                                hideLabel: !q.hideLabel,
                                enabled: q.enabled,
                                required: q.required,
                              })
                            }
                          >
                            {q.hideLabel ? "Box only" : "Show label"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {(formDefinition?.sections ?? []).every(
                (s) => (s.questions ?? []).filter((q) => !q.isBuiltin).length === 0,
              ) && (
                <p className="text-xs text-muted-foreground">
                  No custom questions added yet.
                </p>
              )}
            </CardContent>
          </Card>
          )}

          {(mode !== "form-only" || astEditorPanel === "species") && (
          <Card data-editor-collapsible="true">
            <CardHeader className="pb-3">
              <button
                type="button"
                className="text-left"
                data-editor-collapsible="true"
                onClick={() =>
                  setOpenCatalogPanel((prev) => (prev === "species" ? null : "species"))
                }
              >
                <CardTitle className="text-base">Species</CardTitle>
              </button>
              <p className="text-xs text-muted-foreground">
                Controls species values used in Register New Case. This is kept in
                Admin Panel so case entry users can register cases without form
                configuration controls in the same screen.
              </p>
            </CardHeader>
            {openCatalogPanel === "species" && (
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
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
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
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
            )}
          </Card>
          )}

          {(mode !== "form-only" || astEditorPanel === "species") && (
          <Card data-editor-collapsible="true">
            <CardHeader className="pb-3">
              <button
                type="button"
                className="text-left"
                data-editor-collapsible="true"
                onClick={() =>
                  setOpenCatalogPanel((prev) => (prev === "breeds" ? null : "breeds"))
                }
              >
                <CardTitle className="text-base">Breeds by Species</CardTitle>
              </button>
              <p className="text-xs text-muted-foreground">
                Manage breed dropdown options for each species. Users can still choose "Other" and type manually.
              </p>
            </CardHeader>
            {openCatalogPanel === "breeds" && (
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
              <div className="flex flex-col sm:flex-row gap-2">
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
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded border px-3 py-2"
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
            )}
          </Card>
          )}

          {(mode !== "form-only" || astEditorPanel === "species") && (
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
          )}

          {(mode !== "form-only" || astEditorPanel === "species") && showAuditLog && (
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
    </StickyScrollPage>
  );
}

type AdminUserEditFormProps = {
  user: AdminUser;
  editForm: {
    fullName: string;
    address: string;
    phone: string;
    email: string;
    username: string;
    designation: string;
  };
  setEditForm: Dispatch<
    SetStateAction<{
      fullName: string;
      address: string;
      phone: string;
      email: string;
      username: string;
      designation: string;
    }>
  >;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
};

const AdminUserEditForm = forwardRef<HTMLDivElement, AdminUserEditFormProps>(
  function AdminUserEditForm(
    { user, editForm, setEditForm, isSaving, onCancel, onSave },
    ref,
  ) {
    const fieldId = (field: string) => `edit-${field}-${user.id}`;

    return (
      <div
        ref={ref}
        className="mt-3 pt-3 border-t border-border space-y-3"
        data-testid={`edit-user-form-${user.id}`}
      >
        <p className="text-sm font-semibold">
          Edit User – {user.fullName} (ID: {user.id})
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("fullName")}>Full Name</Label>
            <Input
              id={fieldId("fullName")}
              value={editForm.fullName}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, fullName: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("username")}>Username</Label>
            <Input
              id={fieldId("username")}
              value={editForm.username}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, username: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("email")}>Email</Label>
            <Input
              id={fieldId("email")}
              type="email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("phone")}>Phone</Label>
            <Input
              id={fieldId("phone")}
              value={editForm.phone}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("address")}>Address</Label>
            <Input
              id={fieldId("address")}
              value={editForm.address}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("designation")}>Designation</Label>
            <Input
              id={fieldId("designation")}
              value={editForm.designation}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, designation: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="gap-2" disabled={isSaving} onClick={onSave}>
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    );
  },
);

type AdminActionLogEntry = {
  id: number;
  actorUserId: number;
  actorRole: string;
  actorName: string | null;
  actorUsername: string | null;
  actionType: string;
  targetType: string;
  targetId: string | null;
  /**
   * Resolved full name for `targetType === "user"` rows. Null when the
   * target user no longer exists (was deleted) OR when the target is not
   * a user (e.g. `targetType === "site"` for restores). The UI uses this
   * to show real names alongside the numeric ID.
   */
  targetName: string | null;
  /** Resolved username for user targets; same null semantics as targetName. */
  targetUsername: string | null;
  details: unknown;
  createdAt: string;
};

/**
 * Read-only viewer for the `admin_action_logs` table. Surfaces:
 *   - who did it (actor name + role)
 *   - what they did (action type) and to what (target type + id)
 *   - any structured detail JSON the action recorded (rendered compact)
 *
 * Kept intentionally simple — superadmin can use this to audit account
 * approvals, role changes, password-reset resolutions, and site restores.
 */
function AdminAuditLogPanel() {
  const { toast } = useToast();
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [limit, setLimit] = useState<number>(100);

  const actionTypesQuery = useQuery<string[]>({
    queryKey: ["/api/admin/action-logs/action-types"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/action-logs/action-types");
      return res.json();
    },
    staleTime: 60_000,
  });

  const actionTypeOptions = useMemo(() => {
    const fromApi = (actionTypesQuery.data ?? []).filter((a) => a && a !== "all");
    return ["all", ...fromApi];
  }, [actionTypesQuery.data]);

  useEffect(() => {
    if (actionFilter === "all") return;
    const loaded = actionTypesQuery.data;
    if (!loaded || loaded.length === 0) return;
    if (!loaded.includes(actionFilter)) {
      setActionFilter("all");
    }
  }, [actionFilter, actionTypesQuery.data]);

  const auditQuery = useQuery<AdminActionLogEntry[]>({
    queryKey: ["/api/admin/action-logs", actionFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (actionFilter && actionFilter !== "all") params.set("actionType", actionFilter);
      const res = await apiRequest("GET", `/api/admin/action-logs?${params.toString()}`);
      return res.json();
    },
  });
  const rows = auditQuery.data ?? [];

  const formatRelative = (iso: string): string => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return iso;
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(iso).toLocaleString();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Admin Action Log</CardTitle>
        <p className="text-xs text-muted-foreground">
          Append-only log of administrative actions: approvals, role changes,
          password resets, site restores, and similar. Latest first.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Action type</Label>
            <Select
              value={actionFilter}
              onValueChange={setActionFilter}
              disabled={actionTypesQuery.isLoading}
            >
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder={actionTypesQuery.isLoading ? "Loading types…" : undefined} />
              </SelectTrigger>
              <SelectContent>
                {actionTypeOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === "all" ? "All actions" : a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Show</Label>
            <Select
              value={String(limit)}
              onValueChange={(v) => setLimit(Number.parseInt(v, 10) || 100)}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
                <SelectItem value="200">Last 200</SelectItem>
                <SelectItem value="500">Last 500</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => auditQuery.refetch()}
            disabled={auditQuery.isFetching}
          >
            {auditQuery.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {auditQuery.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : auditQuery.isError ? (
          // Previously we rendered "No admin actions recorded yet." for
          // both the empty-table case AND the request-failed case, which
          // hid a real production bug where the SELECT query was
          // failing on Postgres. Always show the actual server message
          // so the next regression is visible.
          <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Couldn't load the audit log.</p>
            <p className="text-xs mt-1 opacity-90">
              {auditQuery.error instanceof Error
                ? auditQuery.error.message
                : "Unknown error"}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No admin actions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">When</th>
                  <th className="px-2 py-1.5 text-left font-medium">Actor</th>
                  <th className="px-2 py-1.5 text-left font-medium">Action</th>
                  <th className="px-2 py-1.5 text-left font-medium">Target</th>
                  <th className="px-2 py-1.5 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td
                      className="px-2 py-1.5 whitespace-nowrap"
                      title={new Date(row.createdAt).toLocaleString()}
                    >
                      {formatRelative(row.createdAt)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="font-medium">
                        {row.actorName ?? `User ${row.actorUserId}`}
                      </div>
                      <div className="text-muted-foreground">
                        {row.actorUsername ? `@${row.actorUsername} · ` : ""}
                        {row.actorRole}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {row.actionType}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <div className="min-w-0">
                          {/*
                            For user targets, prefer "Full Name" on top with
                            "@username · #id" underneath so the row reads as
                            a person, not a database row. Falls back to
                            "Deleted user · #id" if the user was removed
                            since the action was logged (lookup returned no
                            row). Non-user targets (e.g. "site" for a
                            restore) keep the previous compact rendering.
                          */}
                          {row.targetType === "user" ? (
                            row.targetName ? (
                              <>
                                <div className="font-medium">{row.targetName}</div>
                                <div className="text-muted-foreground">
                                  {row.targetUsername ? `@${row.targetUsername} · ` : ""}
                                  #{row.targetId}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-muted-foreground italic">
                                  Deleted user
                                </div>
                                {row.targetId != null && (
                                  <div className="text-muted-foreground">
                                    #{row.targetId}
                                  </div>
                                )}
                              </>
                            )
                          ) : (
                            <>
                              <div>{row.targetType}</div>
                              {row.targetId != null && (
                                <div className="text-muted-foreground">
                                  #{row.targetId}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {row.targetId != null && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            title="Copy target id"
                            onClick={() => {
                              const text = String(row.targetId);
                              void navigator.clipboard.writeText(text).then(
                                () => {
                                  toast({ title: "Copied", description: text });
                                },
                                () => {
                                  toast({
                                    title: "Copy failed",
                                    description: "Clipboard access was blocked.",
                                    variant: "destructive",
                                  });
                                },
                              );
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] max-w-[28rem]">
                      {row.details == null
                        ? "—"
                        : typeof row.details === "string"
                          ? row.details
                          : JSON.stringify(row.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Access Control — per-module card                                          */
/* ------------------------------------------------------------------------ */

const ACCESS_CONTROL_ROLE_ORDER = [
  "superadmin",
  "admin",
  "staff",
  "intern",
  "student",
  "pending",
] as const;

function roleDisplayLabel(role: string): string {
  if (role === "superadmin") return "Super Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Single feature × roles row in the Access Control panel.
 *
 * Layout rationale:
 *  - Pills are placed in a CSS GRID (not a flex-wrap) so a given role
 *    occupies the same column across all three rows in a card
 *    (Dashboard / Export / Register). Previously the row used flex-wrap
 *    and each pill auto-sized to its "Role On" / "Role Off" text, so
 *    columns drifted between rows and the panel was hard to scan.
 *  - 2 columns on phones (so "Super Admin On" never truncates on a 320px
 *    viewport) → 5 columns from `sm` upwards (one cell per visible role
 *    after we removed `pending`). Each pill fills its cell with
 *    `w-full`, locking horizontal alignment regardless of label width.
 *  - The label column is fixed-width (`sm:w-24`) on desktop so the grid
 *    starts at the same x across all rows. On mobile the label stacks
 *    above the grid because there isn't room for both inline.
 *  - The per-row description blurb was removed — it duplicated the
 *    card-level explainer and pushed the grid down. The feature name
 *    alone ("Dashboard", "Export", "Register") is self-evident.
 *
 * `data-testid` is preserved exactly so existing UI tests keep working.
 */
function AccessControlRoleRow({
  label,
  items,
  onToggle,
}: {
  label: string;
  items: Array<{ role: string; value: boolean }>;
  onToggle: (role: string, next: boolean) => void;
}) {
  const sorted = [...items].sort((a, b) => {
    const ai = ACCESS_CONTROL_ROLE_ORDER.indexOf(a.role as (typeof ACCESS_CONTROL_ROLE_ORDER)[number]);
    const bi = ACCESS_CONTROL_ROLE_ORDER.indexOf(b.role as (typeof ACCESS_CONTROL_ROLE_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return (
    <div className="rounded border bg-muted/10 px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="sm:w-24 sm:shrink-0">
          <div className="text-xs font-semibold">{label}</div>
        </div>
        {sorted.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">
            No roles configured yet.
          </span>
        ) : (
          <div className="grid w-full flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2">
            {sorted.map((row) => (
              <button
                key={row.role}
                type="button"
                onClick={() => onToggle(row.role, !row.value)}
                className={`flex w-full items-center justify-between gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  row.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}-${row.role}`}
              >
                <span className="truncate">{roleDisplayLabel(row.role)}</span>
                <span className="shrink-0 opacity-80">{row.value ? "On" : "Off"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Per-batch override row, rendered nested under the Register section when
 * the role-level Student toggle is ON. We intentionally hide this whole
 * block when the role-level toggle is OFF — letting an admin click a
 * "batch override" while the master switch is off would just silently
 * have no effect, which is confusing. The empty-state copy nudges the
 * admin towards the right place to look.
 */
function BatchOverrideRow({
  studentRoleEnabled,
  batches,
  onToggle,
}: {
  studentRoleEnabled: boolean;
  batches: Array<{ batch: number; registerVisible: boolean }>;
  onToggle: (batch: number, next: boolean) => void;
}) {
  if (!studentRoleEnabled) {
    return (
      <div className="rounded border border-dashed bg-muted/5 px-3 py-2 text-[11px] text-muted-foreground">
        Per-batch overrides are inactive while the role-level Student toggle
        is off. Turn it on above to manage individual batches.
      </div>
    );
  }
  return (
    <div className="rounded border bg-muted/10 px-3 py-2">
      {/*
        Identical outer shape AND grid column count as AccessControlRoleRow
        so each batch pill lines up exactly under a role pill in the rows
        above (e.g. 9th batch sits under Super Admin, 11th under Admin).
        We keep the 5-column grid even when only 2-3 batches are present;
        the trailing columns stay empty rather than letting the pills
        re-flow to a wider width. That asymmetry is what the user
        flagged in the screenshot.
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="sm:w-24 sm:shrink-0">
          <div className="text-xs font-semibold">Batches</div>
          <div className="text-[10px] text-muted-foreground leading-snug">
            New batches inherit automatically.
          </div>
        </div>
        {batches.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">
            No batches enabled yet. Add one in the Allowed Student Batches card above.
          </span>
        ) : (
          <div className="grid w-full flex-1 grid-cols-2 gap-1.5 sm:grid-cols-5 sm:gap-2">
            {batches.map((row) => (
              <button
                key={row.batch}
                type="button"
                onClick={() => onToggle(row.batch, !row.registerVisible)}
                className={`flex w-full items-center justify-between gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  row.registerVisible
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid={`toggle-batch-${row.batch}`}
              >
                <span className="truncate">{formatOrdinalBatch(row.batch)}</span>
                <span className="shrink-0 opacity-80">{row.registerVisible ? "On" : "Off"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Curates the canonical list of student batch numbers. This list is the
 * source of truth for:
 *   1. The signup dropdown (public /api/student-batches).
 *   2. The per-batch override rows in each module card below.
 *
 * UX choices:
 *   - Add via a small inline form (number input + Add button) rather
 *     than a modal — there's almost nothing to configure per row, so a
 *     modal would be overkill.
 *   - Remove is a small × button next to each chip. We DON'T confirm
 *     removal here because the action is reversible (re-adding restores
 *     the per-batch override row that was kept alive on delete), and
 *     existing student accounts on that batch keep working — only
 *     future signups are blocked.
 *   - `inUseByUsers` shows next to each chip so an admin can tell at a
 *     glance which batches are tied to active accounts.
 */
function AllowedBatchesCard({
  batches,
  onAdd,
  onRemove,
  adding,
  removing,
  onRefresh,
}: {
  batches: Array<{ batch: number; inUseByUsers: number }>;
  onAdd: (batch: number) => void;
  onRemove: (batch: number) => void;
  adding: boolean;
  removing: boolean;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    setError(null);
    const trimmed = draft.trim();
    const value = Number.parseInt(trimmed, 10);
    if (!trimmed || !Number.isInteger(value) || value < 1 || value > 99) {
      setError("Enter a whole number between 1 and 99.");
      return;
    }
    if (batches.some((b) => b.batch === value)) {
      setError("That batch is already on the list.");
      return;
    }
    onAdd(value);
    setDraft("");
  };

  return (
    <Card data-editor-collapsible="true">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Allowed Student Batches</CardTitle>
        <p className="text-xs text-muted-foreground leading-snug">
          Students can only pick a batch from this list when signing up.
          Existing accounts on a removed batch keep working — only future
          signups are blocked.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="add-student-batch"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Add batch number
            </label>
            <Input
              id="add-student-batch"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value.replace(/[^0-9]/g, ""));
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="e.g. 9"
              className="h-8 w-28 text-sm"
              data-testid="input-add-student-batch"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={adding}
            data-testid="button-add-student-batch"
          >
            {adding ? "Adding\u2026" : "Add"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            className="text-xs"
          >
            Refresh
          </Button>
          {error ? (
            <span className="text-[11px] text-destructive" role="alert">
              {error}
            </span>
          ) : null}
        </div>

        {batches.length === 0 ? (
          <div
            className="rounded border border-dashed bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground"
            data-testid="text-allowed-batches-empty"
          >
            No batches enabled yet. Students cannot sign up until at least
            one batch is added here.
          </div>
        ) : (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid="list-allowed-batches"
          >
            {batches.map((b) => (
              <span
                key={b.batch}
                className="inline-flex items-center gap-1 rounded-full border bg-background pl-2.5 pr-1 py-0.5 text-[11px]"
                data-testid={`chip-allowed-batch-${b.batch}`}
              >
                <span className="font-medium">{formatOrdinalBatch(b.batch)}</span>
                <span className="text-muted-foreground">
                  {b.inUseByUsers === 0
                    ? "(no users)"
                    : `(${b.inUseByUsers} user${b.inUseByUsers === 1 ? "" : "s"})`}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(b.batch)}
                  disabled={removing}
                  aria-label={`Remove ${formatOrdinalBatch(b.batch)}`}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  data-testid={`button-remove-batch-${b.batch}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleAccessControlCard({
  title,
  description,
  dashboard,
  onDashboardToggle,
  export_,
  onExportToggle,
  register,
  onRegisterToggle,
  batches,
  onBatchToggle,
}: {
  title: string;
  description: string;
  dashboard: Array<{ role: string; dashboardVisible: boolean }>;
  onDashboardToggle: (role: string, next: boolean) => void;
  export_: Array<{ role: string; exportVisible: boolean }>;
  onExportToggle: (role: string, next: boolean) => void;
  register: Array<{ role: string; registerVisible: boolean }>;
  onRegisterToggle: (role: string, next: boolean) => void;
  batches: Array<{ batch: number; registerVisible: boolean }>;
  onBatchToggle: (batch: number, next: boolean) => void;
}) {
  const studentRow = register.find((r) => r.role === "student");
  const studentRoleEnabled = Boolean(studentRow?.registerVisible);
  return (
    <Card data-editor-collapsible="true">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground leading-snug">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <AccessControlRoleRow
          label="Dashboard"
          items={dashboard.map((r) => ({ role: r.role, value: r.dashboardVisible }))}
          onToggle={(role, next) => onDashboardToggle(role, next)}
        />
        <AccessControlRoleRow
          label="Export"
          items={export_.map((r) => ({ role: r.role, value: r.exportVisible }))}
          onToggle={(role, next) => onExportToggle(role, next)}
        />
        <AccessControlRoleRow
          label="Register"
          items={register.map((r) => ({ role: r.role, value: r.registerVisible }))}
          onToggle={(role, next) => onRegisterToggle(role, next)}
        />
        <BatchOverrideRow
          studentRoleEnabled={studentRoleEnabled}
          batches={batches}
          onToggle={onBatchToggle}
        />
      </CardContent>
    </Card>
  );
}

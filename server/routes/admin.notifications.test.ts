import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { registerAdminRoutes } from "./admin";

type Handler = (req: Request, res: Response, next?: () => void) => void | Promise<void>;

class MockApp {
  routes: Record<string, Map<string, Handler[]>> = {
    get: new Map(),
    post: new Map(),
    patch: new Map(),
    delete: new Map(),
  };
  get(path: string, ...handlers: Handler[]) {
    this.routes.get.set(path, handlers);
  }
  post(path: string, ...handlers: Handler[]) {
    this.routes.post.set(path, handlers);
  }
  patch(path: string, ...handlers: Handler[]) {
    this.routes.patch.set(path, handlers);
  }
  delete(path: string, ...handlers: Handler[]) {
    this.routes.delete.set(path, handlers);
  }
}

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as any).mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<Request> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    currentUser: { id: 1, role: "admin", approved: true, designation: "veterinarian" },
    ...overrides,
  } as unknown as Request;
}

const store = {
  users: [{ id: 10, approved: false, fullName: "Pending User", username: "pending1", createdAt: "2026-05-01T00:00:00.000Z", role: "pending" }],
  downloads: [{ id: 20, user_id: 10, request_source: "hospital_case", date_from: null, date_to: null, reason: null, status: "pending", admin_note: null, resolved_by: null, created_at: "2026-05-01T00:01:00.000Z", resolved_at: null }],
  resets: [{ id: 30, user_id: 10, requested_by_role: "student", password_hash: "hash", reason: null, status: "pending", resolved_by: null, resolver_note: null, id_card_filename: null, created_at: "2026-05-01T00:02:00.000Z", resolved_at: null }],
  notificationStates: new Map<string, { is_read: number; is_deleted: number }>(),
};

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    getUsers: vi.fn(async () => store.users as any),
    getUserById: vi.fn(async (id: number) => store.users.find((u: any) => u.id === id) || { id, fullName: "User", username: "u", role: "student", approved: true }),
    getUserDisplayByIds: vi.fn(async (ids: number[]) => {
      const map = new Map<
        number,
        { fullName: string; username: string; designation: string; role: string }
      >();
      for (const id of ids) {
        const u = store.users.find((x: any) => x.id === id) as
          | { fullName: string; username: string; designation?: string; role: string }
          | undefined;
        map.set(
          id,
          u
            ? {
                fullName: u.fullName,
                username: u.username,
                designation: u.designation ?? "student",
                role: u.role,
              }
            : {
                fullName: "User",
                username: "u",
                designation: "student",
                role: "student",
              },
        );
      }
      return map;
    }),
    updateUser: vi.fn(async () => undefined),
  },
}));

vi.mock("../db-query", () => {
  const toQuery = (q: any) =>
    q.toQuery({
      escapeName: (name: string) => name,
      escapeParam: () => "?",
      escapeString: (value: string) => `'${value.replace(/'/g, "''")}'`,
    } as any);

  return {
    dbAll: vi.fn(async (query: any) => {
      const built = toQuery(query).sql.toLowerCase();
      if (built.includes("from download_requests") && built.includes("where status")) {
        return store.downloads.filter((d) => d.status === "pending");
      }
      if (built.includes("from password_reset_requests") && built.includes("where status")) {
        return store.resets.filter((r) => r.status === "pending");
      }
      if (built.includes("from notification_states")) {
        return Array.from(store.notificationStates.entries()).map(([notification_key, row]) => ({
          notification_key,
          is_read: row.is_read,
          is_deleted: row.is_deleted,
        }));
      }
      return [];
    }),
    dbGet: vi.fn(async (query: any) => {
      const built = toQuery(query).sql.toLowerCase();
      if (built.includes("from notification_states")) {
        const key = toQuery(query).params?.[0];
        const row = store.notificationStates.get(String(key));
        if (!row) return undefined;
        return { is_read: row.is_read, is_deleted: row.is_deleted };
      }
      return undefined;
    }),
    dbRun: vi.fn(async (query: any) => {
      const built = toQuery(query);
      const sqlText = built.sql.toLowerCase();
      const params = built.params ?? [];
      if (sqlText.includes("insert into notification_states")) {
        const key = String(params[0]);
        const isRead = Number(params[1]) ? 1 : 0;
        const isDeleted = Number(params[2]) ? 1 : 0;
        store.notificationStates.set(key, { is_read: isRead, is_deleted: isDeleted });
      } else if (sqlText.includes("update download_requests")) {
        const status = String(params[0]);
        const id = Number(params[4]);
        const row = store.downloads.find((d) => d.id === id);
        if (row) row.status = status;
      }
      return { changes: 1 };
    }),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  store.notificationStates.clear();
  store.downloads[0].status = "pending";
  store.resets[0].status = "pending";
});

describe("admin notifications lifecycle", () => {
  it("shows pending requests, supports mark-read and delete-read", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const getNotifications = app.routes.get.get("/api/admin/notifications")!.at(-1)!;
    const patchState = app.routes.patch.get("/api/admin/notifications/state")!.at(-1)!;
    const markAll = app.routes.post.get("/api/admin/notifications/mark-read-all")!.at(-1)!;
    const deleteRead = app.routes.post.get("/api/admin/notifications/delete-read")!.at(-1)!;

    const res1 = makeRes();
    await getNotifications(makeReq(), res1);
    const payload1 = (res1.json as any).mock.calls[0][0];
    expect(payload1.unreadCount).toBe(3);
    expect(payload1.items.length).toBe(3);

    const firstKey = payload1.items[0].key;
    await patchState(makeReq({ body: { key: firstKey, isRead: true } }), makeRes());
    await markAll(makeReq({ body: {} }), makeRes());

    const res2 = makeRes();
    await getNotifications(makeReq(), res2);
    const payload2 = (res2.json as any).mock.calls[0][0];
    expect(payload2.unreadCount).toBe(0);

    await deleteRead(makeReq({ body: {} }), makeRes());
    const res3 = makeRes();
    await getNotifications(makeReq(), res3);
    const payload3 = (res3.json as any).mock.calls[0][0];
    expect(payload3.items.length).toBe(0);
  });

  it("removes notification when request becomes resolved by another admin", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const getNotifications = app.routes.get.get("/api/admin/notifications")!.at(-1)!;

    const res1 = makeRes();
    await getNotifications(makeReq(), res1);
    const before = (res1.json as any).mock.calls[0][0];
    expect(before.items.some((i: any) => i.type === "download-request")).toBe(true);

    store.downloads[0].status = "approved";

    const res2 = makeRes();
    await getNotifications(makeReq(), res2);
    const after = (res2.json as any).mock.calls[0][0];
    expect(after.items.some((i: any) => i.type === "download-request")).toBe(false);
  });
});


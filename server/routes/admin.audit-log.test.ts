import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { registerAdminRoutes } from "./admin";

/**
 * Regression test for the `/api/admin/action-logs` endpoint.
 *
 * The previous implementation built its WHERE clause as
 *   AND (${before} IS NULL OR id < ${before})
 *   AND (${actor}  IS NULL OR actor_user_id = ${actor})
 *   AND (${actionType} = '' OR action_type = ${actionType})
 *   AND (${targetType} = '' OR target_type = ${targetType})
 *
 * which silently broke on Postgres because the `IS NULL` branch produces
 * an untyped NULL bind parameter that Postgres can't infer a type for —
 * the query was rejected at parse time with
 *   "could not determine data type of parameter $1"
 *
 * The UI swallowed the error and rendered "No admin actions recorded
 * yet.", which is exactly the symptom the user reported in production
 * after approving accounts and changing roles.
 *
 * This test exists to lock down the contract that:
 *   1. No filter parameters → emit ZERO `IS NULL` clauses.
 *   2. Each filter parameter, when provided, contributes ONE clause.
 *   3. The data round-trips correctly to the JSON response.
 */

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
    currentUser: { id: 1, role: "superadmin", approved: true, designation: "veterinarian" },
    ...overrides,
  } as unknown as Request;
}

vi.mock("../auth-session-repo", () => ({
  authSessionRepo: {
    getUsers: vi.fn(async () => []),
    getUserById: vi.fn(async () => undefined),
    getUserDisplayByIds: vi.fn(async (ids: number[]) => {
      const map = new Map<number, { fullName: string; username: string; designation: string; role: string }>();
      for (const id of ids) {
        map.set(id, {
          fullName: `Actor ${id}`,
          username: `actor${id}`,
          designation: "veterinarian",
          role: "superadmin",
        });
      }
      return map;
    }),
    updateUser: vi.fn(async () => undefined),
  },
}));

// Capture every SQL string that hits dbAll so we can inspect it.
const capturedSql: string[] = [];

function buildSqlString(query: any): string {
  return query.toQuery({
    escapeName: (name: string) => name,
    escapeParam: () => "?",
    escapeString: (value: string) => `'${value.replace(/'/g, "''")}'`,
  } as any).sql;
}

vi.mock("../db-query", () => ({
  dbAll: vi.fn(async (query: any) => {
    const built = buildSqlString(query);
    capturedSql.push(built);
    if (built.toLowerCase().includes("from admin_action_logs")) {
      if (built.toLowerCase().includes("distinct action_type")) {
        return [
          { action_type: "user.approve" },
          { action_type: "user.role.change" },
        ];
      }
      return [
        {
          id: 2,
          actor_user_id: 1,
          actor_role: "superadmin",
          action_type: "user.role.change",
          target_type: "user",
          target_id: "42",
          details_json: JSON.stringify({ fromRole: "student", toRole: "staff" }),
          created_at: "2026-05-29T10:30:00.000Z",
        },
        {
          id: 1,
          actor_user_id: 1,
          actor_role: "superadmin",
          action_type: "user.approve",
          target_type: "user",
          target_id: "42",
          details_json: JSON.stringify({ assignedRole: "student" }),
          created_at: "2026-05-29T10:00:00.000Z",
        },
      ];
    }
    return [];
  }),
  dbGet: vi.fn(async () => undefined),
  dbRun: vi.fn(async () => ({ changes: 1 })),
}));

afterEach(() => {
  vi.clearAllMocks();
  capturedSql.length = 0;
});

describe("GET /api/admin/action-logs — Postgres-safe WHERE clause", () => {
  it("emits NO 'IS NULL' clauses when called with no filters", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const handler = app.routes.get.get("/api/admin/action-logs")!.at(-1)!;
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);

    const auditSelect = capturedSql.find((s) =>
      s.toLowerCase().includes("from admin_action_logs") && !s.toLowerCase().includes("distinct"),
    );
    expect(auditSelect, "audit-log SELECT should have been executed").toBeDefined();
    // The exact regression we are guarding against: in the original
    // implementation this SQL contained `$1 IS NULL OR id < $2` etc.,
    // which is what made Postgres reject the query at parse time.
    expect(auditSelect!.toLowerCase()).not.toContain(" is null");
  });

  it("returns rows newest-first with parsed details", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const handler = app.routes.get.get("/api/admin/action-logs")!.at(-1)!;
    const res = makeRes();
    await handler(makeReq({ query: {} }), res);

    const payload = (res.json as any).mock.calls[0][0];
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload[0].id).toBe(2);
    expect(payload[0].actionType).toBe("user.role.change");
    expect(payload[0].details).toEqual({ fromRole: "student", toRole: "staff" });
    expect(payload[0].actorName).toBe("Actor 1");
    expect(payload[0].actorUsername).toBe("actor1");
  });

  it("adds an action_type filter only when one is supplied", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const handler = app.routes.get.get("/api/admin/action-logs")!.at(-1)!;
    await handler(
      makeReq({ query: { actionType: "user.role.change", limit: "50" } }),
      makeRes(),
    );

    const auditSelect = capturedSql.find((s) =>
      s.toLowerCase().includes("from admin_action_logs") && !s.toLowerCase().includes("distinct"),
    )!;
    expect(auditSelect.toLowerCase()).toContain("action_type = ?");
    expect(auditSelect.toLowerCase()).not.toContain(" is null");
  });

  it("adds a `before` (cursor) filter only when supplied", async () => {
    const app = new MockApp();
    registerAdminRoutes(app as unknown as any);

    const handler = app.routes.get.get("/api/admin/action-logs")!.at(-1)!;
    await handler(makeReq({ query: { before: "42" } }), makeRes());

    const auditSelect = capturedSql.find((s) =>
      s.toLowerCase().includes("from admin_action_logs") && !s.toLowerCase().includes("distinct"),
    )!;
    expect(auditSelect.toLowerCase()).toContain("id < ?");
    expect(auditSelect.toLowerCase()).not.toContain(" is null");
  });
});

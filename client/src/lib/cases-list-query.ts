import type { Case } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export type CasesPageResponse = {
  items: Case[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function casesListQueryKey(
  caseScope: "ast" | "hospital",
  q: string,
  species: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize: number,
) {
  return ["/api/cases", caseScope, q, species, dateFrom, dateTo, page, pageSize] as const;
}

export async function fetchCasesPage(
  caseScope: "ast" | "hospital",
  q: string,
  species: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize: number,
): Promise<CasesPageResponse> {
  const params = new URLSearchParams();
  params.set("scope", caseScope);
  params.set("paginated", "true");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (q) params.set("q", q);
  if (species) params.set("species", species);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
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
}

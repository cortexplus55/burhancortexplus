/**
 * Minimal in-memory PostgREST-style fake for supabase-js (tests only).
 * Supports the chained query shapes the topic-map pipeline uses, plus an
 * emulation of the credit RPCs (credit_reserve / credit_claim_operation /
 * credit_commit / credit_refund) with production semantics:
 * - reserve returns the existing reservation for any non-refunded key,
 * - claim → "committed" when committed, "busy" when pending and already
 *   claimed by another token, "claimed" otherwise,
 * - a refunded key starts a brand-new reservation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type FakeDb = {
  tables: Record<string, Row[]>;
  log: { table: string; op: string; filters: string[] }[];
};

export type CreditRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  action_code: string;
  status: "pending" | "committed" | "refunded";
  amount: number;
  claim_token: string | null;
};

let idSeq = 0;

export function makeFakeDb(tables: Record<string, Row[]>, options?: { creditCost?: number }) {
  const db: FakeDb = { tables, log: [] };
  const t = (name: string) => (db.tables[name] ??= []);
  const creditCost = options?.creditCost ?? 2;

  function builder(table: string) {
    let op: "select" | "update" | "insert" | "delete" | "upsert" = "select";
    let payload: any = null;
    let returning = false;
    let countMode = false;
    let headOnly = false;
    const filters: ((r: Row) => boolean)[] = [];
    const fdesc: string[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let range: [number, number] | null = null;
    let lim: number | null = null;
    let single: "maybe" | "one" | null = null;
    let onConflict: string | null = null;
    const b: any = {
      select(_c = "*", opts?: { count?: string; head?: boolean }) {
        if (op !== "select") returning = true;
        if (opts?.count) countMode = true;
        if (opts?.head) headOnly = true;
        return b;
      },
      insert(p: any) { op = "insert"; payload = p; return b; },
      update(p: any) { op = "update"; payload = p; return b; },
      upsert(p: any, o?: any) { op = "upsert"; payload = p; onConflict = o?.onConflict ?? null; return b; },
      delete() { op = "delete"; return b; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); fdesc.push(`${c}=${String(v)}`); return b; },
      neq(c: string, v: any) { filters.push((r) => r[c] !== v); return b; },
      in(c: string, vs: any[]) { filters.push((r) => vs.includes(r[c])); fdesc.push(`${c} in[${vs.length}]`); return b; },
      is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return b; },
      not(c: string, _o: string, v: any) { filters.push((r) => (r[c] ?? null) !== v); return b; },
      gte(c: string, v: any) { filters.push((r) => r[c] >= v); return b; },
      lte(c: string, v: any) { filters.push((r) => r[c] <= v); return b; },
      lt(c: string, v: any) { filters.push((r) => r[c] < v); return b; },
      contains(c: string, v: any) {
        const want = typeof v === "string" ? JSON.parse(v) : v;
        filters.push((r) => {
          const have = r[c];
          if (!Array.isArray(have) || !Array.isArray(want)) return false;
          return want.every((w: any) =>
            have.some((h: any) =>
              typeof w === "object" && w
                ? Object.entries(w).every(([k, val]) => h?.[k] === val)
                : h === w,
            ),
          );
        });
        return b;
      },
      or(expr: string) {
        // Only the lease form: lease_until.is.null,lease_until.lt.<iso>
        const m = expr.match(/lease_until\.lt\.(.+)$/);
        const iso = m?.[1];
        filters.push((r) => r.lease_until == null || (iso ? r.lease_until < iso : false));
        return b;
      },
      order(c: string, o?: any) { orders.push({ col: c, asc: o?.ascending !== false }); return b; },
      range(a: number, z: number) { range = [a, z]; return b; },
      limit(n: number) { lim = n; return b; },
      maybeSingle() { single = "maybe"; return exec(); },
      single() { single = "one"; return exec(); },
      then(res: any, rej: any) { return exec().then(res, rej); },
    };
    async function exec() {
      const rows = t(table);
      const match = () => rows.filter((r) => filters.every((f) => f(r)));
      let data: any = null;
      if (op === "insert" || op === "upsert") {
        const items: Row[] = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({
          id: p.id ?? `id${++idSeq}`,
          ...p,
        }));
        if (op === "insert" && table === "document_topic_map_jobs") {
          if (items.some((it: Row) => rows.some((r) => r.document_id === it.document_id))) {
            db.log.push({ table, op, filters: fdesc });
            return { data: null, error: { code: "23505" } };
          }
          for (const it of items) {
            // Column defaults only where the insert gave no value.
            for (const [k, v] of Object.entries({ next_index: 0, topics: [], lease_token: null, lease_until: null })) {
              if (!(k in it)) it[k] = v;
            }
          }
        }
        if (op === "upsert" && onConflict) {
          const keys = onConflict.split(",");
          for (const it of items) {
            const ex = rows.find((r) => keys.every((k) => r[k] === it[k]));
            if (ex) Object.assign(ex, it);
            else rows.push(it);
          }
        } else {
          rows.push(...items);
        }
        data = returning ? items.map((r: Row) => ({ ...r })) : null;
      } else if (op === "update") {
        const m = match();
        for (const r of m) Object.assign(r, payload);
        data = returning ? m.map((r) => ({ ...r })) : null;
      } else if (op === "delete") {
        const m = new Set(match());
        db.tables[table] = rows.filter((r) => !m.has(r));
        if (table === "document_topic_nodes") {
          const ids = new Set([...m].map((r) => r.id));
          db.tables.document_topic_page_links = t("document_topic_page_links").filter(
            (l) => !ids.has(l.topic_id),
          );
        }
      } else {
        let m = match();
        if (orders.length) {
          m = [...m].sort((a, z) => {
            for (const { col, asc } of orders) {
              const d = a[col] > z[col] ? 1 : a[col] < z[col] ? -1 : 0;
              if (d) return asc ? d : -d;
            }
            return 0;
          });
        }
        const total = m.length;
        if (range) m = m.slice(range[0], range[1] + 1);
        if (lim != null) m = m.slice(0, lim);
        data = headOnly ? null : m.map((r) => ({ ...r }));
        if (countMode) {
          db.log.push({ table, op, filters: fdesc });
          return { data, count: total, error: null };
        }
      }
      db.log.push({ table, op, filters: fdesc });
      if (single) {
        const arr = Array.isArray(data) ? data : data == null ? [] : [data];
        if (single === "one" && arr.length !== 1) return { data: null, error: { message: "not single" } };
        return { data: arr[0] ?? null, error: null };
      }
      return { data, error: null };
    }
    return b;
  }

  const credits = (): CreditRow[] => t("credit_reservations") as CreditRow[];

  async function rpc(name: string, args: Record<string, any>) {
    if (name === "credit_reserve") {
      const existing = credits().find(
        (r) => r.user_id === args.p_user_id && r.idempotency_key === args.p_idempotency_key && r.status !== "refunded",
      );
      if (existing) return { data: existing.id, error: null };
      const row: CreditRow = {
        id: `res${++idSeq}`,
        user_id: args.p_user_id,
        idempotency_key: args.p_idempotency_key,
        action_code: args.p_action_code,
        status: "pending",
        amount: creditCost,
        claim_token: null,
      };
      credits().push(row);
      return { data: row.id, error: null };
    }
    if (name === "credit_claim_operation") {
      const row = credits().find((r) => r.id === args.p_reservation_id);
      if (!row) return { data: { state: "missing" }, error: null };
      if (row.status === "committed") return { data: { state: "committed" }, error: null };
      if (row.status === "refunded") return { data: { state: "refunded" }, error: null };
      if (row.claim_token && row.claim_token !== args.p_token) return { data: { state: "busy" }, error: null };
      row.claim_token = args.p_token;
      return { data: { state: "claimed", amount: row.amount }, error: null };
    }
    if (name === "credit_commit") {
      const row = credits().find((r) => r.id === args.p_reservation_id);
      if (!row || row.status === "refunded") return { data: null, error: { message: "not_pending" } };
      row.status = "committed";
      return { data: null, error: null };
    }
    if (name === "credit_refund") {
      const row = credits().find((r) => r.id === args.p_reservation_id);
      if (!row || row.status === "committed") return { data: null, error: { message: "not_pending" } };
      row.status = "refunded";
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const client: any = { from: (name: string) => builder(name), rpc };
  return {
    db,
    client,
    /** Credits actually charged (committed) for a user. */
    chargedCredits: (userId: string) =>
      credits().filter((r) => r.user_id === userId && r.status === "committed").reduce((n, r) => n + r.amount, 0),
    reservations: () => credits(),
  };
}

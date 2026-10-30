/**
 * Sözleşme testleri için kayıt tutan bellek içi Supabase (30 Ekim 2026, yol etkinliği bölmesi).
 *
 * Her `from()` zinciri ve her `rpc()` çağrısı, çalıştığı sırayla tek satır olarak `timeline`a
 * yazılır: tablo, işlem, seçilen sütunlar, süzgeçler, gövde. Rota bölünmeden önce ve sonra aynı
 * senaryo aynı satırları üretmeli — "veritabanı yazımları aynı sırada aynı alanlarla".
 *
 * Süzgeçler gerçek satırlara uygulanır (eq, neq, in, is, gt, gte, lt, lte, not, or, order, limit);
 * `or` virgüllü `kolon.eq.değer`, `kolon.is.null`, `kolon.gt.değer`, `kolon.lt.değer` biçimlerini anlar.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type RpcHandler = (name: string, args: Record<string, any>) => { data?: any; error?: any } | undefined;

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "function") return "[fn]";
    if (item && typeof item === "object" && typeof (item as { from?: unknown }).from === "function") return "[service]";
    if (item instanceof Promise) return "[promise]";
    return item;
  });
}

export function describeValue(value: unknown): string {
  return stable(value);
}

export function makeRecordingDb(
  tables: Record<string, Row[]>,
  options: { timeline: string[]; rpc?: RpcHandler },
) {
  let idSeq = 0;
  const t = (name: string) => (tables[name] ??= []);

  function builder(table: string) {
    let op: "select" | "update" | "insert" | "delete" | "upsert" = "select";
    let columns: string | undefined;
    let payload: any = null;
    let returning = false;
    const filters: ((r: Row) => boolean)[] = [];
    const fdesc: string[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let lim: number | null = null;
    let single: "maybe" | "one" | null = null;
    const push = (desc: string, fn: (r: Row) => boolean) => {
      fdesc.push(desc);
      filters.push(fn);
      return b;
    };
    const b: any = {
      select(c = "*") {
        if (op === "select") columns = c;
        else returning = true;
        return b;
      },
      insert(p: any) { op = "insert"; payload = p; return b; },
      update(p: any) { op = "update"; payload = p; return b; },
      upsert(p: any) { op = "upsert"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      eq: (c: string, v: any) => push(`eq(${c},${stable(v)})`, (r) => r[c] === v),
      neq: (c: string, v: any) => push(`neq(${c},${stable(v)})`, (r) => r[c] !== v),
      in: (c: string, vs: any[]) => push(`in(${c},${stable(vs)})`, (r) => vs.includes(r[c])),
      is: (c: string, v: any) => push(`is(${c},${stable(v)})`, (r) => (r[c] ?? null) === v),
      gt: (c: string, v: any) => push(`gt(${c},${stable(v)})`, (r) => r[c] > v),
      gte: (c: string, v: any) => push(`gte(${c},${stable(v)})`, (r) => r[c] >= v),
      lt: (c: string, v: any) => push(`lt(${c},${stable(v)})`, (r) => r[c] < v),
      lte: (c: string, v: any) => push(`lte(${c},${stable(v)})`, (r) => r[c] <= v),
      not: (c: string, o: string, v: any) =>
        push(`not(${c},${o},${stable(v)})`, (r) => {
          if (o === "in") {
            const list = String(v).replace(/^\(|\)$/g, "").split(",");
            return !list.includes(String(r[c]));
          }
          if (o === "is") return (r[c] ?? null) !== v;
          return r[c] !== v;
        }),
      or: (expr: string) =>
        push(`or(${expr})`, (r) =>
          expr.split(",").some((part) => {
            const [col, kind, ...rest] = part.split(".");
            const value = rest.join(".");
            if (kind === "eq") return String(r[col!]) === value;
            if (kind === "is" && value === "null") return r[col!] == null;
            if (kind === "gt") return r[col!] != null && String(r[col!]) > value;
            if (kind === "lt") return r[col!] != null && String(r[col!]) < value;
            return false;
          }),
        ),
      contains: (c: string, v: any) => push(`contains(${c},${stable(v)})`, () => true),
      order(c: string, o?: any) {
        orders.push({ col: c, asc: o?.ascending !== false });
        fdesc.push(`order(${c},${o?.ascending === false ? "desc" : "asc"})`);
        return b;
      },
      limit(n: number) { lim = n; fdesc.push(`limit(${n})`); return b; },
      range(a: number, z: number) { fdesc.push(`range(${a},${z})`); lim = z - a + 1; return b; },
      maybeSingle() { single = "maybe"; return exec(); },
      single() { single = "one"; return exec(); },
      then(res: any, rej: any) { return exec().then(res, rej); },
    };
    async function exec() {
      const parts = [op, table];
      if (op === "select" && columns) parts.push(`[${columns}]`);
      if (fdesc.length) parts.push(fdesc.join(" "));
      if (payload !== null) parts.push(`payload=${stable(payload)}`);
      if (single) parts.push(single);
      options.timeline.push(`db ${parts.join(" ")}`);
      const rows = t(table);
      const match = () => rows.filter((r) => filters.every((f) => f(r)));
      let data: any = null;
      if (op === "insert" || op === "upsert") {
        const items: Row[] = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({
          id: p.id ?? `${table}-${++idSeq}`,
          ...p,
        }));
        rows.push(...items);
        data = returning ? items.map((r) => ({ ...r })) : null;
      } else if (op === "update") {
        const m = match();
        for (const r of m) Object.assign(r, payload);
        data = returning ? m.map((r) => ({ ...r })) : null;
      } else if (op === "delete") {
        const m = new Set(match());
        tables[table] = rows.filter((r) => !m.has(r));
        data = returning ? [...m] : null;
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
        if (lim != null) m = m.slice(0, lim);
        data = m.map((r) => ({ ...r }));
      }
      if (single) {
        const arr = Array.isArray(data) ? data : data == null ? [] : [data];
        if (single === "one" && arr.length !== 1) return { data: null, error: { message: "not single" } };
        return { data: arr[0] ?? null, error: null };
      }
      return { data, error: null };
    }
    return b;
  }

  const client: any = {
    from: (name: string) => builder(name),
    rpc: async (name: string, args: Record<string, any>) => {
      options.timeline.push(`rpc ${name} ${stable(args)}`);
      const result = options.rpc?.(name, args);
      return { data: result?.data ?? null, error: result?.error ?? null };
    },
  };
  return { client, tables };
}

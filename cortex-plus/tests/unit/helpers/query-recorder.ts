/**
 * Sorgu zinciri kaydeden sahte Supabase istemcisi (öğrenme döngüsü testleri, 20 Ekim 2026).
 * Her `from()` çağrısı bir kayıt açar; `handler` kayda bakıp sonucu döner.
 */
export type FakeCall = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  columns?: string;
  options?: unknown;
  payload?: unknown;
  filters: [string, ...unknown[]][];
};

export type FakeResult = { data?: unknown; error?: unknown; count?: number | null };

export function has(call: FakeCall, name: string, ...args: unknown[]): boolean {
  return call.filters.some(
    (filter) => filter[0] === name && args.every((arg, index) => JSON.stringify(filter[index + 1]) === JSON.stringify(arg)),
  );
}

export function fakeSupabase(handler: (call: FakeCall) => FakeResult | undefined) {
  const calls: FakeCall[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  let rpcResult: FakeResult = { data: { score: 0, total: 1, nextId: null }, error: null };

  const from = (table: string) => {
    const call: FakeCall = { table, op: "select", filters: [] };
    const settle = () => {
      calls.push(call);
      const result = handler(call) ?? {};
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
    };
    const builder: Record<string, unknown> = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return builder;
      };
    for (const name of ["eq", "neq", "is", "in", "gte", "gt", "lt", "lte", "not", "or", "order", "limit", "match"]) {
      builder[name] = chain(name);
    }
    builder.select = (columns?: string, options?: unknown) => {
      if (call.op === "select") {
        call.columns = columns;
        call.options = options;
      }
      return builder;
    };
    builder.insert = (payload: unknown) => {
      call.op = "insert";
      call.payload = payload;
      return builder;
    };
    builder.update = (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return builder;
    };
    builder.upsert = (payload: unknown) => {
      call.op = "upsert";
      call.payload = payload;
      return builder;
    };
    builder.delete = () => {
      call.op = "delete";
      return builder;
    };
    builder.maybeSingle = settle;
    builder.single = settle;
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      settle().then(resolve, reject);
    return builder;
  };

  const service = {
    from,
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  };
  return {
    service,
    calls,
    rpcCalls,
    setRpcResult(result: FakeResult) {
      rpcResult = result;
    },
  };
}

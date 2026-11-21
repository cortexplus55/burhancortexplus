import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ signedIn: true, flag: true, created: 0 }));

vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: vi.fn(async () =>
    state.signedIn
      ? { ok: true, ctx: { userId: "u-1", service: {}, email: null, isAdmin: false, supabase: {} } }
      : { ok: false, response: NextResponse.json({ error: "Giriş yapmalısın." }, { status: 401 }) },
  ),
}));
vi.mock("@/lib/admin/feature-flags", () => ({ isFeatureEnabled: vi.fn(async () => state.flag) }));
vi.mock("@/lib/tutor/realtime/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tutor/realtime/session")>();
  return {
    ...actual,
    createRealtimeSession: vi.fn(async () => {
      state.created += 1;
      return { status: 200, body: { ok: true, sessionId: "s", sdp: "v=0" } };
    }),
  };
});

import { POST as createPOST } from "@/app/api/tutor/realtime-session/route";
import { POST as tickPOST } from "@/app/api/tutor/realtime-session/tick/route";
import { POST as endPOST } from "@/app/api/tutor/realtime-session/end/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/tutor/realtime-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("canlı ses uçlarının kapısı", () => {
  beforeEach(() => {
    state.signedIn = true;
    state.flag = true;
    state.created = 0;
  });

  it("oturum yoksa 401", async () => {
    state.signedIn = false;
    expect((await createPOST(request({ sdp: "v=0 abcdefgh" }))).status).toBe(401);
    expect((await tickPOST(request({}))).status).toBe(401);
    expect((await endPOST(request({}))).status).toBe(401);
  });

  it("teacher.v2 bayrağı kapalıyken 404 (özellik görünmez)", async () => {
    state.flag = false;
    const response = await createPOST(request({ sdp: "v=0 abcdefgh" }));
    expect(response.status).toBe(404);
    expect(state.created).toBe(0);
    expect((await tickPOST(request({ sessionId: "00000000-0000-4000-8000-000000000001", minute: 2 }))).status).toBe(404);
    expect((await endPOST(request({ sessionId: "00000000-0000-4000-8000-000000000001" }))).status).toBe(404);
  });

  it("geçersiz gövde 400; geçerli gövde oturum akışına gider, önbelleğe alınmaz", async () => {
    expect((await createPOST(request({ sdp: 5 }))).status).toBe(400);
    expect((await tickPOST(request({ sessionId: "x", minute: 2 }))).status).toBe(400);
    const response = await createPOST(request({ sdp: "v=0\r\nabcdefgh" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.created).toBe(1);
  });

  it("hız sınırı ve bekçinin süresi", () => {
    const create = readFileSync("src/app/api/tutor/realtime-session/route.ts", "utf8");
    expect(create).toContain('scope: "tutor-realtime-session", limit: 6');
    expect(create).toContain("export const maxDuration = 120;");
    expect(readFileSync("src/app/api/tutor/realtime-session/tick/route.ts", "utf8")).toContain("export const maxDuration = 120;");
    const guard = readFileSync("src/lib/tutor/realtime/route-guard.ts", "utf8");
    expect(guard).toContain("isFeatureEnabled(guard.ctx.service, TEACHER_V2_FLAG, guard.ctx.userId)");
    expect(guard).toContain("after(task)");
  });

  it("istemci OpenAI'ye doğrudan istek atmaz (anahtar ve uç yalnız sunucuda); CSP değişmedi", () => {
    const hook = readFileSync("src/lib/tutor/realtime/use-realtime-tutor.ts", "utf8");
    expect(hook).not.toContain("api.openai.com");
    expect(hook).not.toMatch(/OPENAI_API_KEY|client_secret|ephemeral/i);
    expect(readFileSync("src/lib/security/csp.ts", "utf8")).not.toContain("api.openai.com");
  });
});

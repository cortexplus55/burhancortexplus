import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Paket I #9 (30 Ekim 2026). Ders sonu "Şimdi dinle" canlıda dokuz denemenin dokuzunda "Sesli tekrar bu sefer
  gelmedi" dedi; aynı konunun hazırlık podcast'i çalıştı. Ders sonu ayrı bir hat koşuyordu (kaynak sayfasız, süre
  sınırı yazılmamış, önbelleksiz, hatası yalnız konsolda). Artık hazırlık podcast'inin hattı: aynı kaynak, aynı
  önbellek, aynı hata kaydı; ekran düşüşte bir kez kendiliğinden yeniden ister.
*/

const prepPodcast = vi.hoisted(() => ({ POST: vi.fn() }));
vi.mock("@/app/api/learning/exam-prep/podcast/route", () => prepPodcast);

const read = (path: string) => readFileSync(path, "utf8");
const PREP = "11111111-1111-4111-8111-111111111111";
const TOPIC = "22222222-2222-4222-8222-222222222222";

afterEach(() => prepPodcast.POST.mockReset());

function request(body: unknown) {
  return new Request("https://cortexplus.app/api/learning/exam-prep/lesson-podcast", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "sb-access-token=abc" },
    body: JSON.stringify(body),
  });
}

describe("ders sonu sesli tekrar hazırlık podcast hattından gelir", () => {
  it("isteği konu ve varsayılan süreyle, kontrolsüz ve aynı çerezle iletir; bölümleri döner", async () => {
    prepPodcast.POST.mockImplementation(async (forwarded: Request) => {
      expect(new URL(forwarded.url).pathname).toBe("/api/learning/exam-prep/podcast");
      expect(forwarded.headers.get("cookie")).toBe("sb-access-token=abc");
      const body = await forwarded.json();
      expect(body).toMatchObject({ prepId: PREP, topicId: TOPIC, listeningCheck: false });
      expect(typeof body.length).toBe("string");
      return Response.json({ ok: true, title: "Mizan", chapters: [{ title: "Bölüm 1", lines: [] }], reused: true });
    });
    const { POST } = await import("@/app/api/learning/exam-prep/lesson-podcast/route");
    const res = await POST(request({ prepId: PREP, topicId: TOPIC }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Mizan", chapters: [{ title: "Bölüm 1", lines: [] }], reused: true });
  });

  it("hazırlık hattının hatası olduğu gibi döner (402 Plus kapısı, 5xx yeniden deneme kodu)", async () => {
    prepPodcast.POST.mockResolvedValueOnce(Response.json({ code: "premium_required" }, { status: 402 }));
    const { POST } = await import("@/app/api/learning/exam-prep/lesson-podcast/route");
    const gated = await POST(request({ prepId: PREP, topicId: TOPIC }));
    expect(gated.status).toBe(402);
    prepPodcast.POST.mockResolvedValueOnce(Response.json({ code: "podcast_script_rejected" }, { status: 503 }));
    const failed = await POST(request({ prepId: PREP, topicId: TOPIC }));
    expect(failed.status).toBe(503);
    expect((await failed.json()).code).toBe("podcast_script_rejected");
  });

  it("geçersiz gövde hazırlık hattına hiç gitmez", async () => {
    const { POST } = await import("@/app/api/learning/exam-prep/lesson-podcast/route");
    const res = await POST(request({ prepId: "x", topicId: TOPIC }));
    expect(res.status).toBe(400);
    expect(prepPodcast.POST).not.toHaveBeenCalled();
  });

  it("süre sınırı, kalıcı hata kaydı ve ekranda kendiliğinden yeniden deneme var", () => {
    const lesson = read("src/app/api/learning/exam-prep/lesson-podcast/route.ts");
    expect(lesson).toContain("export const maxDuration = 300;");
    expect(lesson).not.toContain("runTeacherPodcast");
    const prep = read("src/app/api/learning/exam-prep/podcast/route.ts");
    expect(prep).toContain("await recordLessonGenerationFailure(service, {");
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toMatch(/postJsonWithRetry<[^>]*>\(\s*"\/api\/learning\/exam-prep\/lesson-podcast"/);
    expect(session).toContain("clientRequestId: crypto.randomUUID()");
  });
});

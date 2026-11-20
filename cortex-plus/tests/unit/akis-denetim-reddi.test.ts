/**
 * Burhan kararı 5 (15 Kasım 2026): #678 ile ana sohbette de içerik denetimi (moderation) modelle paralel koşuyor
 * (teacher.v2). Denetim reddederse ekrana akmış metne ne olur?
 *
 * Tanım: denetim sonuçlanana kadar modelin ürettiği metin SUNUCUDA tamponda bekler; tarayıcıya tek bayt gitmez ve yanıt
 * başlamaz (`live.gate`). Ret gelirse tampon atılır, model iptal edilir, ayrılan hak iade edilir ve öğrenci yalnız güvenli
 * mesajı görür (düz metin yanıt). Onay gelirse tampon tek seferde akar. Yani öğrenci reddedilmiş metni hiç görmez, kalıcı
 * da olmaz (kayıt yapılmaz).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLiveChannel } from "@/lib/ai/chat-live";

const read = (path: string) => readFileSync(path, "utf8");

async function readAll(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer());
}

describe("canlı kanal: denetim sonuçlanana kadar tampon", () => {
  it("ret: hiçbir bayt akmaz, yanıt başlamaz, tampon atılır", async () => {
    const live = createLiveChannel(Date.now());
    let decide!: (ok: boolean) => void;
    live.gate(new Promise<boolean>((resolve) => { decide = resolve; }));
    live.enable(false);
    live.write("Reddedilecek ");
    live.write("metin parçaları");
    expect(live.started).toBe(false);
    decide(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.blocked).toBe(true);
    expect(live.started).toBe(false);
    // Ret sonrasında gelen parçalar da yazılmaz.
    live.write(" daha fazla");
    expect(live.started).toBe(false);
    // Yanıt hiç çözülmez: öğrenciye canlı akış gitmez (rota düz metin güvenli mesaj döner).
    const raced = await Promise.race([live.response.then(() => "started"), new Promise((resolve) => setTimeout(() => resolve("none"), 20))]);
    expect(raced).toBe("none");
  });

  it("onay: tampon tek seferde akar, sonra parçalar doğrudan", async () => {
    const live = createLiveChannel(Date.now());
    let decide!: (ok: boolean) => void;
    live.gate(new Promise<boolean>((resolve) => { decide = resolve; }));
    live.enable(false);
    live.write("Merhaba ");
    expect(live.started).toBe(false);
    decide(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.started).toBe(true);
    live.write("dünya");
    live.finish({ content: "Merhaba dünya" } as never);
    const body = await readAll(await live.response);
    expect(body.startsWith("Merhaba dünya")).toBe(true);
  });

  it("denetim hata verirse ret sayılır (kapı açılmaz)", async () => {
    const live = createLiveChannel(Date.now());
    live.gate(Promise.reject(new Error("moderation down")));
    live.enable(false);
    live.write("metin");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(live.blocked).toBe(true);
    expect(live.started).toBe(false);
  });
});

describe("sohbet ucu: ret yolu", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("teacher.v2 açıkken ana sohbette paralel denetim; kapı aynı mekanizma", () => {
    expect(route).toContain("const parallelModeration = (Boolean(rest.prepId) || teacherV2) && !imageUrl;");
    expect(route).toContain("live.gate(verdictEarly.then((v) => {");
    expect(route).toContain("if (isBlocked(v)) { blockedMessage = v.message; abortModel(); }");
  });

  it("ret: kayıttan önce hak iade edilir ve güvenli mesaj döner; akış başlamamışsa düz metin", () => {
    const settle = route.slice(route.indexOf("const settleModeration = async"), route.indexOf("const settleModeration = async") + 400);
    expect(settle).toContain("await undoSpend();");
    expect(settle).toContain("return blockedReply(verdict);");
    // Kayıt (complete_chat_operation) denetim kararından SONRA.
    expect(route.indexOf("const refused = await settleModeration();")).toBeLessThan(route.indexOf('service.rpc("complete_chat_operation"'));
    expect(route).toContain("if (live.blocked && blockedMessage && !live.started) {");
  });
});

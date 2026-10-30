// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonOpenChrome } from "@/components/parity/lesson-open-chrome";
import { LESSON_OPEN_COPY } from "@/lib/learning/lesson-open";
import { WIZARD_COPY, WIZARD_STEP_ORDER } from "@/lib/learning/exam-wizard-copy";

afterEach(cleanup);

/*
  Aşinalık kurulumda bir kez (18 Ekim 2026, ürün sahibinin kararı). Dersler önceden yazılıyor;
  açılışta sorulan düzey hazır dersinkinden farklı çıkınca ders atılıp yeniden yazılıyordu.
  Artık düzey kurulumda alınır, bütün konulara yazılır, açılışta sorulmaz ama değiştirilebilir.
  Ruh hali sorusu kalır, yalnız kaydedilir: önceden yazılan içerik ona göre değişemez.
*/
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

describe("kurulumda aşinalık", () => {
  it("sihirbazda çalışma biçiminden sonra, odaktan önce tek soru", () => {
    const order = [...WIZARD_STEP_ORDER] as string[];
    expect(order.indexOf("modality")).toBeLessThan(order.indexOf("familiarity"));
    expect(order.indexOf("familiarity")).toBeLessThan(order.indexOf("focus"));
    expect(WIZARD_COPY.familiarityTitle).toBe("Bu derse ne kadar aşinasın?");
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain('step === "familiarity"');
    expect(wizard).toContain("          familiarity,\n          learningPreferences: {");
    const chat = read("src/components/parity/exam-create-chat.tsx");
    expect(chat).toContain("<legend>Bu derse ne kadar aşinasın?</legend>");
    expect(chat).toContain("          familiarity,\n          documentId:");
  });

  it("hazırlık kurulunca düzey bütün konulara yazılır; zor konu en çok 'duymuştum'dan başlar", () => {
    const create = read("src/app/api/learning/exam-prep/create/route.ts");
    expect(create).toContain('familiarity: z.enum(["new", "heard", "basics", "good", "confident"]).optional()');
    expect(create).toContain(': (parsed.data.familiarity ?? null),');
    expect(create).toContain('? parsed.data.familiarity === "new"');
  });

  it("açılışta düzey biliniyorsa soru atlanır; kartta görünür ve değiştirilebilir", () => {
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("familiarityKnown: Boolean(initialFamiliarity)");
    expect(session).toContain("onChangeLevel={() => setStage(\"familiarity\")}");
    const change = vi.fn();
    render(
      <LessonOpenChrome
        step="create"
        recommendedTitle="Giriş Dersi"
        familiarity="basics"
        onChangeLevel={change}
        onFamiliarity={() => undefined}
        onMood={() => undefined}
        onContinue={() => undefined}
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByText(/Düzey:/).textContent).toContain("Temel bilgileri biliyorum");
    fireEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("ruh hali yalnız kaydedilir: içerik üretimine nötr gider (sözlüde öğretmen tipi kalır)", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain('mood: kind === "oral" ? mood : DEFAULT_MOOD,');
    // Kayıt sürüyor.
    expect(route).toContain('from("study_session_moods").insert');
    expect(LESSON_OPEN_COPY.moodLead).not.toMatch(/uyum sağla/);
  });
});

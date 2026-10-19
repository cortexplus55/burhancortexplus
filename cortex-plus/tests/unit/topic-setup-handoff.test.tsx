// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ExamCreateChat } from "@/components/parity/exam-create-chat";

/*
  19 Ekim 2026, canlıda öğrenci gibi kurulum: sihirbazda ders, tarih ve hedef seçilip "Belgem yok,
  konudan çalışayım" denince sohbet bunları kaybediyordu — "sonra tarihi seçip" diyor, tarihi yeniden
  soruyor ve öğrencinin bütün eski belgelerini (başka hazırlıklarınkini, ikişer kez) "Hangi kaynaktan
  çalışalım?" diye listeliyordu. Bu, "her hazırlığın kendi yolu" kuralına da aykırıydı.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ documents: [{ id: "d1", fileName: "eski.pdf" }] }), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("konudan kurulum: sihirbazın seçimleri taşınır", () => {
  it("tarih geldiyse açılış cümlesi tarih sormaz ve tarih kutusu dolu", () => {
    render(<ExamCreateChat topicOnly initialSubject="Biyoloji" initialExamDate="2026-11-02" initialTarget={75} />);
    expect(screen.queryByText(/sonra tarihi seçip/)).toBeNull();
    expect(screen.getByText(/yolunu çıkaracağım/)).toBeTruthy();
  });

  it("sihirbaz ders, tarih ve hedefi verir; konudan kurulumda belge seçici yok; hedef kayda gider", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("onClick={() => onUseChat({ subject, examDate, target })}");
    const entry = read("src/components/parity/exam-create-entry.tsx");
    expect(entry).toContain("topicOnly={Boolean(picked)}");
    expect(entry).toContain("initialExamDate={picked?.examDate || undefined}");
    const chat = read("src/components/parity/exam-create-chat.tsx");
    expect(chat).toContain("{!topicOnly && docs.length && (needDate || draft.topics.length >= 2) ? (");
    expect(chat).toContain("...(initialTarget ? { targetScore: initialTarget } : {}),");
    expect(chat).toContain(`const [examDate, setExamDate] = useState(initialExamDate ?? "");`);
  });

  // 19 Ekim 2026: kurulan hazırlık sihirbaz taslağı olarak "Kaldığın yerden devam ediyorsun" diye geri geliyordu.
  it("sihirbazdan gelen kurulum bitince sihirbaz taslağı silinir", () => {
    expect(read("src/components/parity/exam-create-chat.tsx")).toContain("if (topicOnly) void dropExamWizardDraft();");
  });
});

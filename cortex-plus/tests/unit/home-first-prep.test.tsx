// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FirstPrepCard } from "@/components/parity/first-prep-card";

/*
  19 Ekim 2026: kayıttan sonra öğrenci sohbet ekranına düşüyordu; "Başla" sohbeti açıp ücretsiz günlük
  hakkın yarısını tek mesajda harcıyordu, notundan hazırlık kurmak yalnız Sınavlar'daydı. Hiç
  hazırlığı olmayan öğrenciye selamın altında ilk adım kartı gösterilir.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(cleanup);

describe("ana sayfa: ilk hazırlık kartı", () => {
  it("hazırlık kurulumuna götürür", () => {
    render(<FirstPrepCard />);
    const link = screen.getByRole("link", { name: /İlk hazırlığını kur/ });
    expect(link.getAttribute("href")).toBe("/deneme-sinavlari/olustur");
  });

  it("yalnız hiç hazırlığı yokken ve açık sohbet yokken görünür; hedef puan kaydı sayılmaz", () => {
    const page = read("src/app/ogretmen/page.tsx");
    expect(page).toContain(`.neq("exam_type", "hedef")`);
    expect(page).toContain("heroFooter={prepCount === 0 && !params.sohbet ? <FirstPrepCard /> : undefined}");
    expect(read("src/components/chat/chat-panel.tsx")).toContain("{heroFooter}");
  });
});

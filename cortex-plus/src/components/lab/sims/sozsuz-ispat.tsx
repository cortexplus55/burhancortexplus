"use client";

import { useState } from "react";
import { SimChips, SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";

/**
 * Sözsüz ispat: (a+b)².
 *
 * Öğrencilerin en inatçı hatası (a+b)² = a² + b² yazmak. Sebebi cebirsel
 * değil görsel: karenin ortadaki iki dikdörtgeni hiç akla gelmiyor.
 *
 * Burada kenarı a+b olan kare dört parçaya bölünüyor ve 2ab'nin nereden
 * geldiği renkli iki dikdörtgen olarak duruyor. Yanlış cevap da ekranda —
 * ne kadar alanın kaybolduğu sayıyla gösteriliyor.
 *
 * (a−b)² ve a²−b² de aynı yöntemle; üçü de aynı görsel dilde olunca
 * öğrenci kalıbı değil fikri öğreniyor.
 */

type Identity = "kare-toplam" | "kare-fark" | "iki-kare-farki";

const W = 380;

export function SozsuzIspatLab() {
  const [identity, setIdentity] = useState<Identity>("kare-toplam");
  const [a, setA] = useState(5);
  const [b, setB] = useState(3);

  const total = a + b;
  const scale = (W - 60) / Math.max(total, 1);
  const A = r2(a * scale);
  const B = r2(b * scale);
  const O = 30;

  const wrongAnswer = a * a + b * b;
  const rightAnswer =
    identity === "kare-toplam"
      ? (a + b) ** 2
      : identity === "kare-fark"
        ? (a - b) ** 2
        : a * a - b * b;

  return (
    <SimShell
      id="sozsuz-ispat"
      title="Sözsüz ispat"
      subject="Matematik"
      summary="(a+b)² neden a² + b² değil? Kayıp alanı gör."
      help={{
        intro:
          "Özdeşlikler ezberlenince unutulur; alan olarak görülünce unutulmaz. Kenarı a+b olan bir karenin alanı, içindeki dört parçanın alanları toplamıdır.",
        steps: [
          "a ve b'yi değiştir — parçaların boyu değişir, ilişki değişmez.",
          "Ortadaki iki dikdörtgene bak: ikisi de a·b, toplamları 2ab.",
          "Sağdaki 'yaygın hata' kartı, a² + b² dendiğinde ne kadar alanın atlandığını söylüyor.",
        ],
        legend: [
          { color: "#f4ae0b", label: "a²" },
          { color: "#7aa2f7", label: "ab (iki tane)" },
          { color: "#54c594", label: "b²" },
        ],
      }}
      controls={
        <>
          <SimChips
            label="Özdeşlik"
            value={identity}
            options={[
              { id: "kare-toplam" as Identity, label: "(a+b)²" },
              { id: "kare-fark" as Identity, label: "(a−b)²" },
              { id: "iki-kare-farki" as Identity, label: "a²−b²" },
            ]}
            onChange={setIdentity}
          />
          <SimSlider label="a" value={a} onChange={setA} min={2} max={10} />
          <SimSlider label="b" value={b} onChange={setB} min={1} max={Math.max(a - 1, 1)} />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Doğru sonuç"
            tone="highlight"
            rows={[
              { label: formulaOf(identity), value: String(rightAnswer) },
              { label: "Açılımı", value: expandOf(identity, a, b) },
            ]}
          />
          <SimReadout
            label="Parçalar"
            tone="accent"
            rows={[
              { label: "a²", value: String(a * a) },
              { label: "2ab", value: String(2 * a * b) },
            ]}
          />
          {identity === "kare-toplam" ? (
            <SimReadout
              label="Yaygın hata"
              rows={[
                { label: "a² + b² denirse", value: String(wrongAnswer) },
                { label: "Atlanan alan", value: `${2 * a * b} (2ab)` },
              ]}
            />
          ) : (
            <SimReadout
              label="b²"
              rows={[
                { label: "Değer", value: String(b * b) },
                { label: "b", value: String(b) },
              ]}
            />
          )}
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${W}`}
        className="sim-chart"
        style={{ maxWidth: "24rem", margin: "0 auto" }}
        role="img"
        aria-label={`${formulaOf(identity)} = ${rightAnswer}`}
      >
        {identity === "iki-kare-farki" ? (
          <>
            {/* Büyük kareden küçük kare çıkarılıyor; kalan L şeklinde. */}
            <rect x={O} y={O} width={A} height={A} fill="rgba(244,174,11,0.22)" stroke="#f4ae0b" strokeWidth="1.5" />
            <rect x={O} y={O} width={B} height={B} fill="#141414" stroke="#54c594" strokeWidth="1.5" />
            <text x={r2(O + A / 2)} y={r2(O + A - 10)} textAnchor="middle" fontSize="13" fill="#f4ae0b">a² = {a * a}</text>
            <text x={r2(O + B / 2)} y={r2(O + B / 2 + 5)} textAnchor="middle" fontSize="12" fill="#54c594">b²</text>
            <text x={O} y={r2(O + A + 22)} fontSize="12" fill="#8a8a8a">Kalan alan = a² − b² = {rightAnswer}</text>
          </>
        ) : identity === "kare-fark" ? (
          <>
            <rect x={O} y={O} width={A} height={A} fill="rgba(122,162,247,0.10)" stroke="#5a5a5a" strokeWidth="1" strokeDasharray="4 4" />
            <rect x={O} y={O} width={r2(A - B)} height={r2(A - B)} fill="rgba(244,174,11,0.25)" stroke="#f4ae0b" strokeWidth="1.5" />
            <text x={r2(O + (A - B) / 2)} y={r2(O + (A - B) / 2 + 5)} textAnchor="middle" fontSize="13" fill="#f4ae0b">
              (a−b)² = {rightAnswer}
            </text>
            <text x={O} y={r2(O + A + 22)} fontSize="12" fill="#8a8a8a">
              a² − 2ab + b² = {a * a} − {2 * a * b} + {b * b}
            </text>
          </>
        ) : (
          <>
            {/* a² */}
            <rect x={O} y={O} width={A} height={A} fill="rgba(244,174,11,0.25)" stroke="#f4ae0b" strokeWidth="1.5" />
            <text x={r2(O + A / 2)} y={r2(O + A / 2 + 5)} textAnchor="middle" fontSize="14" fill="#f4ae0b">a² = {a * a}</text>

            {/* ab — sağ üst */}
            <rect x={r2(O + A)} y={O} width={B} height={A} fill="rgba(122,162,247,0.25)" stroke="#7aa2f7" strokeWidth="1.5" />
            <text x={r2(O + A + B / 2)} y={r2(O + A / 2)} textAnchor="middle" fontSize="12" fill="#7aa2f7">ab</text>

            {/* ab — sol alt */}
            <rect x={O} y={r2(O + A)} width={A} height={B} fill="rgba(122,162,247,0.25)" stroke="#7aa2f7" strokeWidth="1.5" />
            <text x={r2(O + A / 2)} y={r2(O + A + B / 2 + 4)} textAnchor="middle" fontSize="12" fill="#7aa2f7">ab</text>

            {/* b² */}
            <rect x={r2(O + A)} y={r2(O + A)} width={B} height={B} fill="rgba(84,197,148,0.25)" stroke="#54c594" strokeWidth="1.5" />
            <text x={r2(O + A + B / 2)} y={r2(O + A + B / 2 + 4)} textAnchor="middle" fontSize="12" fill="#54c594">b²</text>

            <text x={O} y={20} fontSize="12" fill="#8a8a8a">
              Kenar = a + b = {total} · Alan = {rightAnswer}
            </text>
            <text x={O} y={r2(O + A + B + 22)} fontSize="12" fill="#8a8a8a">
              a² + 2ab + b² = {a * a} + {2 * a * b} + {b * b} = {rightAnswer}
            </text>
          </>
        )}
      </svg>
    </SimShell>
  );
}

function formulaOf(id: Identity): string {
  if (id === "kare-toplam") return "(a+b)²";
  if (id === "kare-fark") return "(a−b)²";
  return "a² − b²";
}

function expandOf(id: Identity, a: number, b: number): string {
  if (id === "kare-toplam") return `${a * a} + ${2 * a * b} + ${b * b}`;
  if (id === "kare-fark") return `${a * a} − ${2 * a * b} + ${b * b}`;
  return `(${a}−${b})(${a}+${b})`;
}

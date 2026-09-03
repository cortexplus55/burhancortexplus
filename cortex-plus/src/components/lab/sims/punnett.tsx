"use client";

import { useMemo, useState } from "react";
import { SimChips, SimReadout, SimShell } from "@/components/lab/sim-shell";

/**
 * Punnett karesi.
 *
 * En yaygın yanılgı: "baskın gen daha sık görülür". Değil — baskınlık
 * sıklıkla değil, hangi allelin fenotipte görüneceğiyle ilgili. Bu yüzden
 * genotip ve fenotip oranları AYRI kartlarda: Aa × Aa çaprazında genotip
 * 1:2:1 iken fenotip 3:1 çıkıyor ve fark gözle görülüyor.
 *
 * İki karakterli çapraz de var (9:3:3:1) çünkü öğrenci onu ezberliyor;
 * karenin 16 gözünü sayarak nereden geldiğini görmek ezberi bilgiye
 * çeviriyor.
 */

type Cross = "tek" | "cift";

const GENOTYPES = ["AA", "Aa", "aa"] as const;
type Genotype = (typeof GENOTYPES)[number];

function gametes(g: string): string[] {
  // "AaBb" -> ["AB","Ab","aB","ab"]
  const pairs: string[][] = [];
  for (let i = 0; i < g.length; i += 2) {
    pairs.push([g[i], g[i + 1]]);
  }
  return pairs.reduce<string[]>(
    (acc, [x, y]) => acc.flatMap((p) => [p + x, p + y]),
    [""],
  );
}

/** "aA" gibi yazımı "Aa" yapar; sayım tutarlı olsun. */
function normalize(child: string): string {
  let out = "";
  for (let i = 0; i < child.length; i += 2) {
    const [x, y] = [child[i], child[i + 1]];
    out += x.toUpperCase() === x ? x + y : y + x;
  }
  return out;
}

function phenotypeOf(genotype: string, traits: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < genotype.length; i += 2) {
    const pair = genotype.slice(i, i + 2);
    const dominant = pair[0] === pair[0].toUpperCase();
    parts.push(dominant ? traits[i] : traits[i + 1]);
  }
  return parts.join(" · ");
}

export function PunnettLab() {
  const [cross, setCross] = useState<Cross>("tek");
  const [p1, setP1] = useState<Genotype>("Aa");
  const [p2, setP2] = useState<Genotype>("Aa");

  const father = cross === "tek" ? p1 : `${p1}Bb`;
  const mother = cross === "tek" ? p2 : `${p2}Bb`;

  const gf = useMemo(() => gametes(father), [father]);
  const gm = useMemo(() => gametes(mother), [mother]);

  const grid = useMemo(
    () =>
      gm.map((m) =>
        gf.map((f) => {
          // Aynı harfli allelleri eşleştir: A ile A, B ile B.
          let child = "";
          for (let i = 0; i < f.length; i++) child += f[i] + m[i];
          return normalize(child);
        }),
      ),
    [gf, gm],
  );

  const flat = grid.flat();
  const total = flat.length;

  const genoCounts = countBy(flat);
  const traitNames =
    cross === "tek" ? ["Baskın", "Çekinik"] : ["Baskın", "Çekinik", "Baskın", "Çekinik"];
  const phenoCounts = countBy(flat.map((g) => phenotypeOf(g, traitNames)));

  return (
    <SimShell
      id="punnett"
      title="Punnett karesi"
      subject="Biyoloji"
      summary="Genotip 1:2:1 iken fenotip neden 3:1?"
      help={{
        intro:
          "Punnett karesi, iki ebeveynin gametlerinin bütün olası birleşimlerini gösterir. Baskınlık bir allelin daha sık görülmesi değil, heterozigotta hangi özelliğin ortaya çıkacağıdır.",
        steps: [
          "Aa × Aa çaprazına bak: genotip 1:2:1 ama fenotip 3:1 çıkıyor.",
          "Bir ebeveyni AA yap — bütün yavrular baskın fenotipte, ama genotipler farklı.",
          "İki karakterli çaprazda 16 göz sayılıyor; 9:3:3:1 buradan geliyor.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Baskın fenotip" },
          { color: "#7aa2f7", label: "Çekinik fenotip" },
        ],
      }}
      controls={
        <>
          <SimChips
            label="Çapraz"
            value={cross}
            options={[
              { id: "tek" as Cross, label: "Tek karakter" },
              { id: "cift" as Cross, label: "İki karakter" },
            ]}
            onChange={setCross}
          />
          <SimChips
            label="1. ebeveyn"
            value={p1}
            options={GENOTYPES.map((g) => ({ id: g, label: g }))}
            onChange={setP1}
          />
          <SimChips
            label="2. ebeveyn"
            value={p2}
            options={GENOTYPES.map((g) => ({ id: g, label: g }))}
            onChange={setP2}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Genotip oranı"
            tone="accent"
            rows={Object.entries(genoCounts)
              .sort()
              .slice(0, 4)
              .map(([g, c]) => ({
                label: g,
                value: `${c}/${total} · %${((c / total) * 100).toFixed(0)}`,
              }))}
          />
          <SimReadout
            label="Fenotip oranı"
            tone="highlight"
            rows={Object.entries(phenoCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([p, c]) => ({
                label: p,
                value: `${c}/${total} · %${((c / total) * 100).toFixed(0)}`,
              }))}
          />
          <SimReadout
            label="Çapraz"
            rows={[
              { label: "Ebeveynler", value: `${father} × ${mother}` },
              { label: "Göz sayısı", value: String(total) },
            ]}
          />
        </>
      }
    >
      <div className="pn-wrap">
        <table className="pn">
          <thead>
            <tr>
              <th aria-label="Gametler" />
              {gf.map((g) => (
                <th key={g}>{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={gm[i]}>
                <th scope="row">{gm[i]}</th>
                {row.map((child, j) => {
                  const dominant = child[0] === child[0].toUpperCase();
                  return (
                    <td
                      key={`${i}-${j}`}
                      className={dominant ? "is-dominant" : "is-recessive"}
                    >
                      {child}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimShell>
  );
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it] = (out[it] ?? 0) + 1;
  return out;
}

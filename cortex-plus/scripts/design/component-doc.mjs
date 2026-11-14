#!/usr/bin/env node
/**
 * 02-bilesen-kullanimi.md üreticisi (Faz 0): component-usage.mjs verisi + elle yazılmış props/varyant notları.
 *
 *   node scripts/design/component-usage.mjs --json docs/design-migration/data/bilesen-kullanimi.json
 *   node scripts/design/component-doc.mjs
 */
import fs from "node:fs";

const DATA = "docs/design-migration/data/bilesen-kullanimi.json";
const OUT = "docs/design-migration/02-bilesen-kullanimi.md";
const { usage, raw, pageCount } = JSON.parse(fs.readFileSync(DATA, "utf8"));

// Elle: depodaki karşılık, props sözleşmesi, varyantlar (dosyalardan okundu, 14 Kasım 2026).
const NOTES = {
  Button: {
    repo: "`Button` (`ui/button.tsx`, sınıflar `ui/button-variants.ts`)",
    props: "`variant`, `size`, `block`, `loading`, `loadingLabel` + base-ui Button props. `data-slot=\"button\"`, Faz 0'dan beri `data-variant` (rol).",
    variants: "variant: primary (varsayılan), default, secondary, ghost, danger, danger-ghost, brand, outline, destructive, link · size: sm 36, md/default 44, lg 52, xs 32, icon 44, icon-xs 32, icon-sm 36, icon-lg 52. `data-variant` eşlemesi: primary/default/brand → brand, secondary/outline → glass, ghost → weak, link → link, danger* → danger (prompt'un listesinde yok). `inverse` karşılığı yok.",
  },
  IconButton: {
    repo: "`IconButton` (`ui/icon-button.tsx`)",
    props: "`aria-label` zorunlu (tipte), `size`, `variant` + base-ui Button props.",
    variants: "size: sm 36, md 44 · variant: ghost (varsayılan), secondary.",
  },
  Badge: { repo: "`Badge`, `Chip` (`ui/badge.tsx`)", props: "`variant` + span props.", variants: "neutral, brand, action, success, warning, danger, info, ai, default, secondary, destructive (+ Chip varyantları)." },
  Segmented: {
    repo: "`SegmentedControl` (`ui/segmented-control.tsx`); kendi seçicileri: `TutorModeSwitcher` (sohbet), `AudienceTabs` (misafir)",
    props: "SegmentedControl: seçenekler + değer + değişim.",
    variants: "Tek görünüm; öbür seçiciler kendi CSS'iyle.",
  },
  Card: { repo: "`Card` ailesi (`ui/card.tsx`), `StatCard` (`ui/stat-card.tsx`)", props: "div props.", variants: "Yok. Sayfaların çoğu kendi kart sınıfını yazıyor (`cp-*-card`, `cx-pp-*`, `sg-card`)." },
  ListRow: {
    repo: "**Ortak bileşen yok.** Aynı desen sınıf olarak: `cx-lib-row` (Kütüphane), `cx-pp-row` (profil), `cp-set-row` (Ayarlar), `cp-more-action` (sınav sohbeti menüsü), `mk-faq__q` (Yardım).",
    props: "—",
    variants: "—",
  },
  Dialog: {
    repo: "**Ortak bileşen yok.** Her pencere kendi bileşeni: `ProfileDialog`, `StarsDialog`, `JourneyDialog`, `ParityDialogHost` (adres `?dialog=`), Kütüphane (sor-shell içinde). Ortak davranış kancası `useDismiss` (`lib/ui/use-dismiss.ts`: Esc, odak dönüşü).",
    props: "Her biri `open` + `onClose`.",
    variants: "—",
  },
  Sheet: { repo: "`ProfileSidePanel` (`parity/profile-identity.tsx`, 480 px yan panel), `UpgradeSheet` (`paywall/upgrade-sheet.tsx`)", props: "`open`, `onClose` + içerik props.", variants: "—" },
  Popover: { repo: "**Ortak bileşen yok.** Tek örnek: `SourceModePill` menüsü (`chat/source-mode-pill.tsx`); `cp-mood-menu` sohbet içinde.", props: "—", variants: "—" },
  Toast: { repo: "`Toaster` (`ui/sonner.tsx`) + `toast()` (sonner)", props: "sonner.", variants: "success, error, info (sonner)." },
  Skeleton: { repo: "`Skeleton` (`ui/skeleton.tsx`)", props: "div props.", variants: "Yok." },
  Progress: { repo: "`ProgressBar`, `ProgressSegments` (`ui/progress-bar.tsx`), `ProgressRing` (`ui/progress-ring.tsx`)", props: "değer + en çok.", variants: "Yok." },
  AnswerOption: {
    repo: "`OptionCard` (`ui/option-card.tsx`); test ekranı (`exam-quiz-play.tsx`) kendi şık düğmelerini çiziyor",
    props: "`letter`, `state`, `label` …",
    variants: "state: idle, hover, selected, correct, incorrect, missed, dimmed.",
  },
  Composer: { repo: "`ChatPanel` içindeki yazma kutusu (`chat/chat-panel.tsx`), ana ekranın ince çubuğu (`HomeToolsTray` / `cx-slim`, `parity/home-cockpit.tsx`)", props: "ChatPanel'in props'u (çok sayıda).", variants: "parity / exam görünümü." },
  Callout: { repo: "**Ortak bileşen yok.** Ders notları (`als-note--*`), `cp-info*`, uyarı kutuları sayfa sayfa.", props: "—", variants: "—" },
  TopBar: { repo: "`ParitySorShell` üst çubuğu (`header.cx-home-top`, `parity/sor-shell.tsx`)", props: "Kabuğun props'u (`account`, `userName`, `streak`, `chrome`, `home` …).", variants: "chrome: app, exam, focus, session (session'da çubuk yok)." },
  ProfileCapsule: { repo: "`AccountCapsule` (`parity/profile-identity.tsx`)", props: "`name`, `initial`, `identity` (`planIdentity`), `open`, `onOpen`.", variants: "look: free, plus, sigma (kurucu = sigma)." },
  PhoneTabBar: { repo: "`ParitySorShell` alt çubuğu (`nav.cp-sor-bottomnav`)", props: "Kabuktan.", variants: "Beş öğe; <768 px." },
};

let md = `# 02 · Bileşen kullanım matrisi

Üretim: \`node scripts/design/component-usage.mjs --json ${DATA}\` + \`node scripts/design/component-doc.mjs\`.
Yöntem: \`src/\` içe aktarma grafiği; her sayfanın (ve üst \`layout.tsx\`'lerinin) dolaylı olarak ulaştığı dosyalar. "Rota" = o bileşen dosyasına ulaşan gerçek sayfa (${pageCount} sayfa; fikstürler hariç).

## Özet
| Bileşen (ORTAK KURALLAR 4.3) | Depodaki karşılık | Rota | Doğrudan içe aktaran |
|---|---|---|---|
${Object.entries(usage)
  .map(([n, u]) => `| ${n} | ${NOTES[n].repo} | ${u.routes.length} | ${u.importers.length} |`)
  .join("\n")}

Not: Toast kökte (\`app/layout.tsx\`) olduğu için bütün rotalara ulaşır. TopBar, ProfileCapsule ve PhoneTabBar aynı kabuk dosyasında.

`;
for (const [n, u] of Object.entries(usage)) {
  const r = u.routes;
  md += `## ${n}\n- **Depoda:** ${NOTES[n].repo}\n- **Props sözleşmesi:** ${NOTES[n].props}\n- **Varyantlar:** ${NOTES[n].variants}\n`;
  md += `- **Rotalar (${r.length}):** ${r.length ? r.slice(0, 25).map((x) => `\`${x}\``).join(", ") + (r.length > 25 ? ` … +${r.length - 25}` : "") : "—"}\n`;
  md += `- **Doğrudan içe aktaran (${u.importers.length}):** ${u.importers.slice(0, 12).map((x) => `\`${x}\``).join(", ") || "—"}${u.importers.length > 12 ? ` … +${u.importers.length - 12}` : ""}\n\n`;
}
const noShared = raw.filter((x) => !x.usesShared);
md += `## Ham kullanım (ortak düğme yerine kendi \`<button>\` / sınıflı bağlantı yazan dosyalar)

${raw.length} dosya, toplam ${raw.reduce((a, x) => a + x.buttons, 0)} \`<button>\` ve ${raw.reduce((a, x) => a + x.styledLinks, 0)} sınıflı bağlantı; ${noShared.length} dosya ortak \`Button\`/\`IconButton\`'ı hiç içe aktarmıyor. Faz 3+ için anlamı: \`data-variant\` yalnız ortak \`Button\`'da; ham düğmelerin rolü sınıflarından (\`cx-brand\`, \`cx-glass\`, \`cx-weak\`, \`cp-exam-continue\` …) okunur (denetim betiği bu sınıfları da sayar). Tam liste \`${DATA}\` (\`raw\`).

| Dosya | \`<button>\` | Sınıflı bağlantı | Ortak düğme |
|---|---|---|---|
${raw.slice(0, 40).map((x) => `| \`${x.file}\` | ${x.buttons} | ${x.styledLinks} | ${x.usesShared ? "evet" : "hayır"} |`).join("\n")}
| … | | | |
`;
fs.writeFileSync(OUT, md);
console.log(`yazıldı: ${OUT}`);

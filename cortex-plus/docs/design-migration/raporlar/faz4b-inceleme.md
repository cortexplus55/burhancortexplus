# Faz 4B · İnceleme (kod yok)

Ders ekranı (LessonV3), rota `/deneme-sinavlari/:id/dugum/:dugum`. 14 Kasım 2026, dal `design/ders-ekrani`.

## Bileşen ağacı

| Katman | Dosya | Not |
|---|---|---|
| Sayfa (sunucu) | `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx` | `ParitySorShell chrome="session"` → `ExamNodeSession` |
| Yaşam döngüsü | `src/components/parity/exam-node/use-node-lifecycle.ts` | aşama, istekler, cevap kuyruğu (çizim bileşeni durum tutmaz) |
| Ders çizimi | `src/components/parity/exam-node/lesson.tsx` → `ExamLessonSteps` | yapısal ders yoksa eski düz metin (`ExamLessonBodyLazy`) |
| Adımlar | `src/components/parity/exam-lesson-steps.tsx` (1.997 satır) | `buildSteps` adımları kurar; üst çubuk `.als-top`, ilerleme `.als-progress`, alt eylem `.als-cta` |
| Kartlar | `src/components/parity/lesson-visual-cards.tsx` | `FormulaCard` (`.als-formula-card`), `ExamTrapCard` (`.als-visual--trap`), `MemoryHookCard` (`.als-visual--hook`), kaydırma (`.als-visual--carousel`) |
| Şema | `src/components/parity/source-page-drawer.tsx:176` | "📌 Belgedeki Şema — Sayfa N" |
| Genel bilgi | `exam-lesson-steps.tsx:361-367` | `.als-note--general`, kapalı başlar |
| Farklı anlat | `exam-lesson-steps.tsx:1783-1887` | `.als-reexplain-btn` |
| İki şık arasında kaldım | `src/components/learning/two-option-hint.tsx` | `.cp-two-chip` |
| Stil | `src/styles/exam-lesson-steps.css` (1.889 satır) | `.als-*` |

`SOURCE_NUMBER_PRIORITY` bir istem kuralıdır (`teaching-rubric.ts`); ekranda ayrı bir etiketi yok, bilgi kutularında
(`.als-note--exam` "Sınav ipucu") görünür. İçerik üretim hattı, kaynak etiketleri, adım gezinme mantığı ve KaTeX işleme
bu fazda değişmez.

## Testler ve seçiciler

Mevcut e2e: `tests/e2e/ders-mobil.spec.ts`, `tests/e2e/anlar.spec.ts` (`.als-*` sınıflarına dayanır). Yeni görünüm DOM'u
değiştirmediği için seçiciler aynen çalışır.

## Hazırlık sayfası

Dokunulmaz (`exam-prep-home.tsx`; bu fazın kapsamı dışında).

## Uygulama kararı

Desen-türetme (ANA-PROMPT §2.7): yeni görünüm `ui.v2.ders` bayrağı arkasında; sayfa bayrak açıkken `ExamNodeSession`'ı
`<div class="cx-ui-scope" data-ui="ders">` ile sarar (`display: contents`), kurallar `src/styles/ui-v2-ders.css`'te
yalnız `[data-ui~="ders"]` altında. Bayrak KAPALIYKEN sarmalayıcı yok: DOM ve görünüm eskisiyle birebir. Davranış kodu
ortak (kopya mantık yok).

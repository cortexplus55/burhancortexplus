"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { FARK_ITEMS, FARK_LABELS, FARK_SECTION, type FarkItemId } from "@/lib/marketing/fark-accordion";
import { cn } from "@/lib/utils";

/**
 * "Aynı not, iki ayrı sonuç" akordeonu (Faz 9, 20 Kasım 2026). Altı başlık, bir anda tek başlık açık; ilk yüklemede 1.
 * başlık açık (sunucu çiziminde de). Başka bir başlığa dokununca o açılır, öbürü kapanır ve sahne yumuşak bir geçişle
 * değişir. Açık başlık kapatılamaz (WAI-ARIA akordeon kalıbı: düğmesi `aria-disabled`).
 *
 * Yerleşim tek DOM'la: sahne açık başlığın içinde, metninin hemen ardından durur. Telefonda ve tablette (< 960 px) böylece
 * başlığın içinde açılır; geniş ekranda başlık sarmalayıcısı `display: contents` olur ve sahne ızgaranın sağ sütununa
 * (7/12) yapışkan olarak yerleşir, başlıklar solda (5/12). Okuma ve odak sırası her genişlikte aynı: başlık → metin →
 * sahne → sonraki başlık.
 *
 * Klavye: Enter / Space açar (yerel düğme); ↑ ↓ başlıklar arasında gezer, Home / End ilk ve son başlığa gider.
 * Sahneler sunucuda çizilip prop olarak gelir (QR çizimi istemci paketine girmez); istek yok, ses yalnız tıklamayla.
 */

export function FarkAccordion({ scenes }: { scenes: Partial<Record<FarkItemId, ReactNode>> }) {
  const [open, setOpen] = useState(0);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = useRef(false);

  // Açılan başlık, kapanan uzun sahne yüzünden ekranın dışına kaçtıysa görünür alana getirilir (yalnız ziyaretçi seçince).
  useEffect(() => {
    if (!chosen.current) return;
    const trigger = triggers.current[open];
    if (!trigger || typeof trigger.scrollIntoView !== "function") return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    trigger.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [open]);

  function choose(index: number) {
    if (index === open) return;
    chosen.current = true;
    setOpen(index);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = FARK_ITEMS.length - 1;
    const target =
      event.key === "ArrowDown"
        ? (index + 1) % FARK_ITEMS.length
        : event.key === "ArrowUp"
          ? (index - 1 + FARK_ITEMS.length) % FARK_ITEMS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    triggers.current[target]?.focus();
  }

  return (
    <div className="fk" data-testid="fark-accordion" data-open={FARK_ITEMS[open]?.id}>
      {FARK_ITEMS.map((item, index) => {
        const isOpen = index === open;
        const triggerId = `fk-trigger-${item.id}`;
        const panelId = `fk-panel-${item.id}`;
        const scene = scenes[item.id];
        return (
          <div key={item.id} className={cn("fk-item", isOpen && "is-open", isOpen && scene && "has-scene")} data-item={item.id}>
            <h3 className="fk-head">
              <button
                ref={(node) => {
                  triggers.current[index] = node;
                }}
                id={triggerId}
                type="button"
                className="fk-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-disabled={isOpen || undefined}
                onClick={() => choose(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="fk-node" aria-hidden>
                  {item.emoji}
                </span>
                <span className="fk-title">{item.title}</span>
                {item.plus ? <span className="fk-plus">{FARK_LABELS.plus}</span> : null}
                <ChevronDown className="fk-chevron" aria-hidden />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={triggerId} className="fk-panel" hidden={!isOpen}>
              {item.body.map((sentence) => (
                <p key={sentence} className="fk-body">
                  {sentence}
                </p>
              ))}
              <p className="fk-diff">
                <span className="fk-diff-them">
                  <X className="fk-diff-icon" strokeWidth={3} aria-hidden />
                  <strong>{FARK_LABELS.them}:</strong> {item.diff.them}
                </span>{" "}
                <span className="fk-diff-us">
                  <Check className="fk-diff-icon" strokeWidth={3} aria-hidden />
                  <strong>{FARK_LABELS.us}:</strong> {item.diff.us}
                </span>
              </p>
            </div>
            {isOpen && scene ? (
              <div
                className="fk-scene fv"
                role="group"
                aria-label={`${item.title}: ${FARK_SECTION.sceneSuffix}`}
                data-testid="fark-scene"
                data-scene={item.id}
              >
                {scene}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DossierLine } from "@/lib/teacher/dossier";

type Loaded = { lines: DossierLine[]; empty: boolean };

/**
 * "Neye baktım" (PROMPT-V2 §3 şeffaflık, PR-2; teacher.v2): öğretmenin okuduğu kayıtlar, salt okunur ("Öğretmenin
 * bildikleri"). Her satır kaynağına bağlı; kaydı oradan silmek bilgiyi siler (panel "Yenile" ile yeniden okur). Veri
 * açılınca okunur (sayfa açılışını bekletmez). Kayıt yoksa dürüst cümle. Bayrak kapalıyken çizilmez.
 */
export function TeacherDossierPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [data, setData] = useState<Loaded | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  async function load(fresh = false) {
    setState("loading");
    try {
      const response = await fetch(`/api/teacher/dossier${fresh ? "?yenile=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as Loaded;
      setData({ lines: Array.isArray(body.lines) ? body.lines : [], empty: Boolean(body.empty) });
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (!open) return;
    if (state === "idle") void load();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta bir kez okunur
  }, [open]);

  // Hap satırın ortasında durabilir: panel ekranın sağından taşmasın.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu || typeof window === "undefined") return;
    menu.style.transform = "";
    const rect = menu.getBoundingClientRect();
    const shift = Math.min(Math.max(0, rect.right - (window.innerWidth - 12)), Math.max(0, rect.left - 12));
    if (shift > 0) menu.style.transform = `translateX(-${Math.round(shift)}px)`;
  }, [open, state]);

  return (
    <div className="cp-source-pill cp-dossier" ref={rootRef}>
      <button
        type="button"
        className="cp-ctrl-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Neye baktım: öğretmenin okuduğu kayıtlar"
        onClick={() => setOpen((next) => !next)}
      >
        <span aria-hidden>🔎</span>
        <span className="cp-ctrl-pill-label">Neye baktım</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      {open ? (
        <div className="cp-source-menu cp-dossier-panel" role="dialog" aria-label="Öğretmenin bildikleri" ref={menuRef}>
          <p className="cp-dossier-title">Öğretmenin bildikleri</p>
          {state === "loading" || state === "idle" ? (
            <p className="cp-dossier-note" role="status">
              Kayıtlarına bakıyorum…
            </p>
          ) : state === "error" ? (
            <p className="cp-dossier-note" role="alert">
              Şu an okunamadı.{" "}
              <button type="button" className="cp-dossier-link" onClick={() => void load(true)}>
                Tekrar dene
              </button>
            </p>
          ) : data?.empty ? (
            <p className="cp-dossier-note">Seni daha tanımıyorum; birkaç soruyla başlayalım.</p>
          ) : (
            <ul className="cp-dossier-list">
              {data?.lines.map((line) => (
                <li key={line.key}>
                  <span>{line.text}</span>
                  <a className="cp-dossier-link" href={line.href}>
                    {line.sourceLabel}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {state === "ready" ? (
            <p className="cp-dossier-foot">
              Yalnız kendi kayıtların; bir kaydı oradan silersen bilgi de gider.{" "}
              <button type="button" className="cp-dossier-link" onClick={() => void load(true)}>
                Yenile
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

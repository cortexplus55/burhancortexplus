"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

type Block = { id: string; name: string; createdAt: string };

/**
 * Ayarlar → "Gizlilik ve yasal": düelloda engellediğin oyuncular (26 Kasım 2026, mobil 1. adım). Liste açılınca okunur
 * (sayfa açılışında sorgu yok); "Engeli kaldır" oyuncuyu sıralamalara geri getirir.
 */
export function DuelBlocksCard() {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    setFailed(false);
    try {
      const response = await fetch("/api/student/duel-blocks", { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const data = (await response.json()) as { blocks?: Block[] };
      setBlocks(Array.isArray(data.blocks) ? data.blocks : []);
    } catch {
      setFailed(true);
    }
  }

  async function remove(block: Block) {
    setRemoving(block.id);
    try {
      const response = await fetch(`/api/student/duel-blocks?id=${encodeURIComponent(block.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete");
      setBlocks((current) => (current ?? []).filter((item) => item.id !== block.id));
      toast.success(`${block.name} artık engelli değil.`);
    } catch {
      toast.error("Engel kaldırılamadı. Yeniden dene.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="cp-set-duel-blocks">
      <button
        type="button"
        className="cp-set-duel-blocks-toggle"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && blocks === null) void load();
        }}
      >
        Düelloda engellediğin oyuncular
      </button>
      {open ? (
        <div className="cp-set-duel-blocks-body">
          {failed ? (
            <p role="status">
              Liste okunamadı.{" "}
              <button type="button" className="cp-set-inline-link" onClick={() => void load()}>
                Yeniden dene
              </button>
            </p>
          ) : blocks === null ? (
            <p role="status">Yükleniyor…</p>
          ) : blocks.length === 0 ? (
            <p>Engellediğin oyuncu yok. Bir oyuncuyu düello sıralamasındaki seçeneklerden engelleyebilirsin.</p>
          ) : (
            <ul>
              {blocks.map((block) => (
                <li key={block.id}>
                  <span>
                    <strong>{block.name}</strong>
                    <span>{formatDate(block.createdAt)}</span>
                  </span>
                  <button type="button" className="cp-set-inline-link" disabled={removing === block.id} onClick={() => void remove(block)}>
                    Engeli kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

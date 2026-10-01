"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AVATAR_OPTIONS } from "@/lib/parity/signup";

/**
 * Profil kartındaki "Avatarı değiştir" (Astra'da var; 1 Ekim 2026).
 * Kayıttaki emoji listesinden seçilir ya da baş harfe dönülür.
 */
export function AvatarPicker({
  current,
  onChange,
}: {
  current: string | null;
  /** Ayarlar penceresi kendi önizlemesini günceller. */
  onChange?: (value: string | null) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function choose(value: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: value }),
      });
      if (!res.ok) throw new Error("save_failed");
      onChange?.(value);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Avatar kaydedilemedi. Biraz sonra yeniden dene.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cp-avatar-pick">
      <button
        type="button"
        className="cp-avatar-pick-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Avatarı değiştir
      </button>
      {open ? (
        <div className="cp-avatar-pick-grid" role="group" aria-label="Avatar seç">
          {AVATAR_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="cp-avatar-pick-option"
              aria-label={`Avatar ${emoji}`}
              aria-pressed={current === emoji}
              disabled={saving}
              onClick={() => void choose(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className="cp-avatar-pick-option cp-avatar-pick-initial"
            aria-pressed={!current}
            disabled={saving}
            onClick={() => void choose(null)}
          >
            Baş harfim
          </button>
        </div>
      ) : null}
    </div>
  );
}

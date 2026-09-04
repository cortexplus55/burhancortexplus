"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { endPromoCampaign, savePromoCampaign } from "@/app/admin/actions";

/**
 * Ana ekran duyuru bandının formu.
 *
 * Bitiş tarihi zorunlu ve gelecekte olmak zorunda. Sebebi ürün kararı: bant
 * kendiliğinden bitmeli. Süresiz bir "fırsat yakında bitiyor" bandı yalan
 * söyler ve öğrenci bunu bir kez fark ettiğinde bir daha hiçbir duyuruya
 * inanmaz.
 */
export function CampaignForm({
  current,
}: {
  current: { title: string; description: string; href: string; endsAt: string } | null;
}) {
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [href, setHref] = useState(current?.href ?? "/pay");
  // `datetime-local` yerel saat bekliyor; ISO'nun sonundaki saniye ve Z eki
  // alanı boş bırakıyordu.
  const [endsAt, setEndsAt] = useState(
    current?.endsAt ? current.endsAt.slice(0, 16) : "",
  );
  const [pending, startTransition] = useTransition();

  const valid =
    title.trim().length >= 3 &&
    description.trim().length >= 5 &&
    href.trim().startsWith("/") &&
    endsAt.length > 0 &&
    new Date(endsAt).getTime() > Date.now();

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Başlık (büyük harfle görünür)
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Yıllık planda indirim"
            className="adm-input"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Tıklayınca gideceği yer
          <input
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="/pay"
            className="adm-input"
          />
        </label>
      </div>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Açıklama
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Yıllık plana geçenler iki ay ödemiyor."
          className="adm-input"
        />
      </label>

      <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
        Bitiş tarihi ve saati — bu andan sonra bant kaybolur
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          className="adm-input w-full sm:w-72"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || !valid}
          onClick={() =>
            startTransition(async () => {
              const result = await savePromoCampaign({
                title: title.trim(),
                description: description.trim(),
                href: href.trim(),
                endsAt: new Date(endsAt).toISOString(),
              });
              if (result.ok) toast.success(result.message ?? "Kaydedildi.");
              else toast.error(result.error ?? "Kaydedilemedi.");
            })
          }
        >
          {pending ? "Kaydediliyor…" : current ? "Bandı değiştir" : "Bandı yayına al"}
        </button>

        {current ? (
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await endPromoCampaign();
                if (result.ok) toast.success(result.message ?? "Kaldırıldı.");
                else toast.error(result.error ?? "Kaldırılamadı.");
              })
            }
          >
            Bandı hemen kaldır
          </button>
        ) : null}
      </div>
    </div>
  );
}

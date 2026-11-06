"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteUserDocuments, deleteUserPreps } from "@/app/admin/kullanicilar/actions";
import { AdminBadge } from "@/components/admin/admin-ui";
import { DELETE_BATCH_MAX, DELETE_CONFIRM_WORD, deleteConfirmationMatches } from "@/lib/admin/user-manage-copy";

/*
  Hazırlık ve belge listesi; kurucu seçip kalıcı siler (6 Kasım 2026). İki adım: seçilenlerin adlarını gösteren
  onay paneli ve "SİL" yazdırma. Sunucu aynı onayı ve sahipliği yeniden denetler; yönetici yalnız listeyi görür.
  Dar ekranda satırlar kart olur (yatay kaydırma yok).
*/

export type PrepRow = {
  id: string;
  title: string;
  type: string | null;
  created: string;
  topics: number;
  steps: number;
  done: number;
  href: string;
};

export type DocumentRow = {
  id: string;
  name: string;
  pages: number | null;
  size: string;
  status: string;
  statusTone: "ok" | "warn" | "bad" | "mute";
  created: string;
  /** Bu belgeyle kurulmuş hazırlıklar: belge silinince onlar da gider. */
  linkedPreps: string[];
};

type Kind = "prep" | "document";
/** İç tür kodu; ekranda görünmez (Türkçe bekçisi JSX içindeki çıplak dizgeleri tarar). */
const PREP_KIND: Kind = "prep";

function ConfirmPanel({
  kind,
  names,
  extra,
  pending,
  onConfirm,
  onCancel,
}: {
  kind: Kind;
  names: string[];
  extra: string[];
  pending: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const ready = deleteConfirmationMatches(text);
  const what = kind === "prep" ? "hazırlık" : "belge";
  return (
    <div className="adm-confirm adm-confirm--danger" role="alertdialog" aria-label={`${what} silme onayı`}>
      <p>
        <strong>
          {names.length} {what} kalıcı olarak silinecek.
        </strong>{" "}
        Bu işlem geri alınamaz.
      </p>
      <ul className="adm-confirm-list">
        {names.map((name, index) => (
          <li key={`${name}-${index}`}>{name}</li>
        ))}
      </ul>
      {kind === "prep" ? (
        <p className="adm-tool-hint">Yol, konular, dersler ve yazılı denemeler gider; belgeler kalır.</p>
      ) : (
        <p className="adm-tool-hint">
          Dosya, okunan sayfalar ve arama kayıtları gider; dosya başka bir belgede de kullanılıyorsa dosya kalır.
        </p>
      )}
      {extra.length ? (
        <p className="adm-tool-hint">
          Bu belgelerle kurulmuş şu hazırlıklar da silinir: <strong>{extra.join(", ")}</strong>
        </p>
      ) : null}
      <label className="adm-tool-field">
        <span>
          Onaylamak için <strong>{DELETE_CONFIRM_WORD}</strong> yazın
        </span>
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          className="adm-input"
        />
      </label>
      <div className="adm-tool-row">
        <button
          type="button"
          className="adm-btn adm-btn--danger"
          disabled={pending || !ready}
          onClick={() => onConfirm(text)}
        >
          Kalıcı olarak sil
        </button>
        <button type="button" className="adm-btn" disabled={pending} onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}

function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { selected, toggle, clear: () => setSelected(new Set()) };
}

export function UserContentDelete({
  userId,
  preps,
  documents,
  canDelete,
}: {
  userId: string;
  preps: PrepRow[];
  documents: DocumentRow[];
  /** Yalnız kurucu; sunucu da `checkFounderActor` ister. */
  canDelete: boolean;
}) {
  const prepSelection = useSelection();
  const docSelection = useSelection();
  const [confirming, setConfirming] = useState<Kind | null>(null);
  const [pending, startTransition] = useTransition();

  const chosenPreps = useMemo(() => preps.filter((row) => prepSelection.selected.has(row.id)), [preps, prepSelection.selected]);
  const chosenDocs = useMemo(() => documents.filter((row) => docSelection.selected.has(row.id)), [documents, docSelection.selected]);
  const linked = useMemo(() => [...new Set(chosenDocs.flatMap((doc) => doc.linkedPreps))], [chosenDocs]);

  function remove(kind: Kind, confirm: string) {
    startTransition(async () => {
      const result =
        kind === "prep"
          ? await deleteUserPreps({ userId, ids: chosenPreps.map((row) => row.id), confirm })
          : await deleteUserDocuments({ userId, ids: chosenDocs.map((row) => row.id), confirm });
      if (result.ok) {
        toast.success(result.message);
        (kind === "prep" ? prepSelection : docSelection).clear();
        setConfirming(null);
      } else toast.error(result.error);
    });
  }

  return (
    <div className="adm-tool-stack">
      <section aria-label="Hazırlıklar">
        <h3 className="adm-subtitle">Hazırlıklar ({preps.length})</h3>
        {preps.length ? (
          <ul className="adm-stack-list">
            {preps.map((row) => (
              <li key={row.id} className="adm-stack-item">
                {canDelete ? (
                  <input
                    type="checkbox"
                    className="adm-check"
                    checked={prepSelection.selected.has(row.id)}
                    onChange={() => prepSelection.toggle(row.id)}
                    aria-label={`${row.title} seç`}
                  />
                ) : null}
                <div className="adm-stack-main">
                  <Link href={row.href} className="font-medium underline">
                    {row.title}
                  </Link>
                  <p className="adm-stack-meta">
                    {row.type ? `${row.type} · ` : ""}kuruluş {row.created} · {row.topics} konu · {row.done}/{row.steps} adım
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Hazırlık yok.</p>
        )}
        {canDelete && chosenPreps.length ? (
          confirming === PREP_KIND ? (
            <ConfirmPanel
              kind={PREP_KIND}
              names={chosenPreps.map((row) => row.title)}
              extra={[]}
              pending={pending}
              onConfirm={(text) => remove(PREP_KIND, text)}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              disabled={chosenPreps.length > DELETE_BATCH_MAX}
              onClick={() => setConfirming(PREP_KIND)}
            >
              Seçilen {chosenPreps.length} hazırlığı sil
            </button>
          )
        ) : null}
      </section>

      <section aria-label="Belgeler">
        <h3 className="adm-subtitle">Belgeler ({documents.length})</h3>
        {documents.length ? (
          <ul className="adm-stack-list">
            {documents.map((row) => (
              <li key={row.id} className="adm-stack-item">
                {canDelete ? (
                  <input
                    type="checkbox"
                    className="adm-check"
                    checked={docSelection.selected.has(row.id)}
                    onChange={() => docSelection.toggle(row.id)}
                    aria-label={`${row.name} seç`}
                  />
                ) : null}
                <div className="adm-stack-main">
                  <p className="adm-stack-name">{row.name}</p>
                  <p className="adm-stack-meta">
                    {row.pages ?? "—"} sayfa · {row.size} · yükleme {row.created}
                    {row.linkedPreps.length ? ` · ${row.linkedPreps.length} hazırlığın kaynağı` : ""}
                  </p>
                </div>
                <AdminBadge tone={row.statusTone}>{row.status}</AdminBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Belge yok.</p>
        )}
        {canDelete && chosenDocs.length ? (
          confirming === "document" ? (
            <ConfirmPanel
              kind="document"
              names={chosenDocs.map((row) => row.name)}
              extra={linked}
              pending={pending}
              onConfirm={(text) => remove("document", text)}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <button
              type="button"
              className="adm-btn adm-btn--danger"
              disabled={chosenDocs.length > DELETE_BATCH_MAX}
              onClick={() => setConfirming("document")}
            >
              Seçilen {chosenDocs.length} belgeyi sil
            </button>
          )
        ) : null}
      </section>

      {!canDelete ? <p className="adm-tool-hint">Kalıcı silme yalnız kurucuya açık.</p> : null}
    </div>
  );
}

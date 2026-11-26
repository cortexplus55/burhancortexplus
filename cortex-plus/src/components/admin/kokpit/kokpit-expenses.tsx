"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminTableFrame } from "@/components/admin/admin-ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { kokpitCall } from "@/components/admin/kokpit/kokpit-controls";
import { VENDORS, type CloudExpense } from "@/lib/founder-cockpit/vendors";

/*
  Yurt dışı API ve bulut faturaları (Faz 13). Ekleme formu seçili aya yazar; satırda "KDV 2" ve "Mali müşavire gönderildi"
  işaretleri tek dokunuşla değişir; yanlış girilen satır onay penceresiyle silinir. Dolar ya da TL tutarından biri yeter
  (TL girilmezse kurla çevrilir).
*/

const COLUMNS = [
  "Sağlayıcı",
  "Fatura no",
  "USD",
  "TL",
  "KDV 2",
  "Müşavire gönderildi",
  "İşlem",
];

const parseNumber = (value: string) =>
  value.trim() ? Number(value.replace(/\s/g, "").replace(",", ".")) : 0;
const money = (value: number, digits = 2) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export function KokpitExpenses({
  month,
  expenses,
  usdTryRate,
  disabled,
}: {
  month: string;
  expenses: CloudExpense[];
  usdTryRate: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    vendor: "OpenAI",
    amountUsd: "",
    amountTry: "",
    invoiceNumber: "",
    notes: "",
    kdv2: true,
  });
  const [removing, setRemoving] = useState<CloudExpense | null>(null);
  const deleteRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const returnRef = useRef<HTMLElement | null>(null);

  function add(event: React.FormEvent) {
    event.preventDefault();
    const amountUsd = parseNumber(form.amountUsd);
    const amountTry = parseNumber(form.amountTry);
    if (
      !Number.isFinite(amountUsd) ||
      !Number.isFinite(amountTry) ||
      (amountUsd <= 0 && amountTry <= 0)
    ) {
      toast.error("Dolar ya da TL tutarından birini gir.");
      return;
    }
    start(async () => {
      const result = await kokpitCall("/api/admin/kokpit/expenses", {
        method: "POST",
        body: JSON.stringify({
          periodMonth: month,
          vendor: form.vendor,
          amountUsd,
          amountTry,
          invoiceNumber: form.invoiceNumber,
          notes: form.notes,
          kdv2: form.kdv2,
        }),
      });
      if (!result.ok) {
        toast.error(result.message ?? "Fatura eklenemedi.");
        return;
      }
      toast.success("Fatura eklendi.");
      setForm((current) => ({
        ...current,
        amountUsd: "",
        amountTry: "",
        invoiceNumber: "",
        notes: "",
      }));
      router.refresh();
    });
  }

  function patch(id: string, body: Record<string, boolean>) {
    start(async () => {
      const result = await kokpitCall("/api/admin/kokpit/expenses", {
        method: "PATCH",
        body: JSON.stringify({ id, ...body }),
      });
      if (!result.ok) toast.error(result.message ?? "Fatura güncellenemedi.");
      router.refresh();
    });
  }

  function confirmDelete() {
    const target = removing;
    if (!target) return;
    start(async () => {
      const result = await kokpitCall("/api/admin/kokpit/expenses", {
        method: "DELETE",
        body: JSON.stringify({ id: target.id }),
      });
      if (!result.ok) {
        toast.error(result.message ?? "Fatura silinemedi.");
        return;
      }
      toast.success("Fatura silindi.");
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {expenses.length ? (
        <AdminTableFrame columns={COLUMNS} stack>
          {expenses.map((row) => {
            const tryValue =
              row.amountTry > 0 ? row.amountTry : row.amountUsd * usdTryRate;
            return (
              <tr key={row.id}>
                <td data-label="Sağlayıcı">
                  {row.vendor}
                  {row.notes ? (
                    <div className="adm-tool-hint">{row.notes}</div>
                  ) : null}
                </td>
                <td data-label="Fatura no">{row.invoiceNumber ?? "—"}</td>
                <td data-label="USD" className="adm-num">
                  ${money(row.amountUsd)}
                </td>
                <td data-label="TL" className="adm-num">
                  ₺{money(tryValue)}
                  {row.amountTry > 0 ? null : (
                    <div className="adm-tool-hint">kurla çevrildi</div>
                  )}
                </td>
                <td data-label="KDV 2">
                  <input
                    type="checkbox"
                    className="adm-check"
                    checked={row.kdv2}
                    aria-label={`${row.vendor} faturası 2 No.lu KDV kapsamında`}
                    disabled={disabled || pending}
                    onChange={(event) =>
                      patch(row.id, { kdv2: event.target.checked })
                    }
                  />
                </td>
                <td data-label="Müşavire gönderildi">
                  <input
                    type="checkbox"
                    className="adm-check"
                    checked={row.sentToAccountant}
                    aria-label={`${row.vendor} faturası mali müşavire gönderildi`}
                    disabled={disabled || pending}
                    onChange={(event) =>
                      patch(row.id, { sentToAccountant: event.target.checked })
                    }
                  />
                </td>
                <td data-label="İşlem">
                  <button
                    type="button"
                    className="adm-btn adm-btn--danger"
                    ref={(node) => {
                      deleteRefs.current.set(row.id, node);
                    }}
                    disabled={disabled || pending}
                    onClick={() => {
                      returnRef.current =
                        deleteRefs.current.get(row.id) ?? null;
                      setRemoving(row);
                    }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            );
          })}
        </AdminTableFrame>
      ) : (
        <p className="adm-tool-hint">Bu ay için henüz fatura girilmedi.</p>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end"
        onSubmit={add}
      >
        <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
          Sağlayıcı
          <select
            className="adm-select"
            value={form.vendor}
            onChange={(event) =>
              setForm((current) => ({ ...current, vendor: event.target.value }))
            }
            disabled={disabled || pending}
          >
            {VENDORS.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
          Tutar (USD)
          <input
            className="adm-input"
            inputMode="decimal"
            value={form.amountUsd}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                amountUsd: event.target.value,
              }))
            }
            disabled={disabled || pending}
          />
        </label>
        <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
          Tutar (TL, isteğe bağlı)
          <input
            className="adm-input"
            inputMode="decimal"
            value={form.amountTry}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                amountTry: event.target.value,
              }))
            }
            disabled={disabled || pending}
          />
        </label>
        <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
          Fatura no
          <input
            className="adm-input"
            value={form.invoiceNumber}
            maxLength={120}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                invoiceNumber: event.target.value,
              }))
            }
            disabled={disabled || pending}
          />
        </label>
        <label className="adm-tool-field grid gap-1 text-xs text-[var(--adm-muted)]">
          Not
          <input
            className="adm-input"
            value={form.notes}
            maxLength={500}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            disabled={disabled || pending}
          />
        </label>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="adm-check"
              checked={form.kdv2}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  kdv2: event.target.checked,
                }))
              }
              disabled={disabled || pending}
            />
            KDV 2 kapsamında
          </label>
          <button
            type="submit"
            className="adm-btn adm-btn--primary"
            disabled={disabled || pending}
          >
            {pending ? "Ekleniyor…" : "Fatura ekle"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Fatura silinsin mi?"
        description={
          removing
            ? `${removing.vendor} faturası (${removing.invoiceNumber ?? "numarasız"}, $${money(removing.amountUsd)}) kokpitten silinir. Bu işlem geri alınamaz.`
            : ""
        }
        confirmLabel="Sil"
        pendingLabel="Siliniyor…"
        pending={pending}
        onConfirm={confirmDelete}
        returnFocusRef={returnRef}
      />
    </div>
  );
}

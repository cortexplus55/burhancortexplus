"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, QrCode } from "lucide-react";

/**
 * Sınıf davet kartı.
 *
 * Katılım kodu sayfada vardı ama alt satırda düz metin olarak duruyordu:
 * "12 üye · kod ABC123". Otuz kişilik bir sınıfı çağırmanın tek yolu kodu tek
 * tek okutmaktı ve kod okutmak ölçeklenmiyor — sınıf grubuna yapıştırılan bir
 * bağlantı ölçekleniyor.
 *
 * Hazır mesaj bilerek tek parça: öğrenci "ne yazsam" diye durmasın, kopyala
 * ve yapıştır. Bağlantı `/siniflar?kod=...` biçiminde, o sayfa kodu forma
 * kendisi dolduruyor — davet edilen kişi hiçbir şey yazmıyor.
 *
 * QR sunucuda üretiliyor (`lib/qr.ts`); kod dış servise gitmiyor. Sınıfta
 * tahtaya yansıtmak ya da telefondan telefona okutmak için.
 */
export function ClassInvite({
  className,
  code,
  url,
  qr,
}: {
  className: string;
  code: string;
  url: string;
  qr: string;
}) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const message =
    `${className} için birlikte çalışıyoruz. Katılmak için:\n${url}\n\n` +
    `Bağlantı açılmazsa kodu elle gir: ${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Davet mesajı kopyalandı — sınıf grubuna yapıştır.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano izni yoksa mesaj elle seçilebilsin.
      toast.error("Kopyalanamadı. Bağlantı: " + url);
    }
  }

  return (
    <div className="cp-class-invite">
      <div className="cp-class-invite-main">
        <p className="cp-class-invite-title">Sınıfını çağır</p>
        <p className="cp-class-invite-body">
          Bağlantıyı sınıf grubuna yapıştır. Açan kişi kodu yazmadan katılır.
        </p>
        <p className="cp-class-invite-code">{code}</p>
      </div>

      <div className="cp-class-invite-acts">
        <button type="button" className="cp-class-invite-primary" onClick={copy}>
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? "Kopyalandı" : "Davet mesajını kopyala"}
        </button>
        <button
          type="button"
          className="cp-class-invite-ghost"
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrCode className="h-4 w-4" aria-hidden />
          QR
        </button>
      </div>

      {showQr ? (
        <div className="cp-class-invite-qr">
          {/* Sunucuda üretilmiş data URI; dış istek yok. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`${className} katılım QR kodu`} width={180} height={180} />
          <p>Telefonla okut ya da tahtaya yansıt.</p>
        </div>
      ) : null}
    </div>
  );
}

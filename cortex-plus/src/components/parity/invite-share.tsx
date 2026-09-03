"use client";

import { toast } from "sonner";

export function InviteShare({
  url,
  code,
  qr,
}: {
  url: string;
  code: string;
  /** Sunucuda uretilen data URI -- token dis servise gitmez. */
  qr: string;
}) {
  return (
    <div className="ap-invite-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="Davet QR kodu" width={200} height={200} />
      <p className="ap-invite-code">{code}</p>
      <p className="ap-upload-hint break-all">{url}</p>
      <button
        type="button"
        className="ap-upload-pick"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast.success("Davet bağlantısı kopyalandı.");
        }}
      >
        Bağlantıyı kopyala
      </button>
    </div>
  );
}

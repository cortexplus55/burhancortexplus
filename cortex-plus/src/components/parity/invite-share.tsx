"use client";

import { toast } from "sonner";
import { qrImageUrl } from "@/lib/app-url";

export function InviteShare({ url, code }: { url: string; code: string }) {
  return (
    <div className="ap-invite-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrImageUrl(url, 200)} alt="Davet QR kodu" />
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

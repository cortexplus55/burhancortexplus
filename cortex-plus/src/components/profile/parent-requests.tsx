"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { respondToParentRequest } from "@/app/kayit/actions";

export type ParentRequest = {
  id: string;
  parentName: string;
  createdAt: string | null;
};

export function ParentRequests({ requests }: { requests: ParentRequest[] }) {
  const [pending, startTransition] = useTransition();

  function respond(id: string, accept: boolean) {
    startTransition(async () => {
      const result = await respondToParentRequest(id, accept);
      if (result.ok) {
        toast.success(accept ? "Veli bağlantısı onaylandı." : "İstek reddedildi.");
      } else {
        toast.error("İşlem tamamlanamadı.");
      }
    });
  }

  if (!requests.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Bekleyen veli bağlantı isteğin yok.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li
          key={request.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
        >
          <span>
            <strong>{request.parentName}</strong> seni veli olarak takip etmek
            istiyor.
          </span>
          <span className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => respond(request.id, true)}
            >
              Onayla
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => respond(request.id, false)}
            >
              Reddet
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import "@/styles/origin-marketing.css";

export default function NotFound() {
  return (
    <OriginMarketingPage title="Sayfa bulunamadı">
      <div className="mx-auto max-w-md px-4 pb-16 text-center">
        <p className="mk-prose">
          Aradığın sayfa taşınmış veya hiç var olmamış olabilir.
        </p>
        <Link href="/" className="mk-btn-primary mt-8 inline-flex px-8 py-3 text-sm">
          Ana sayfaya dön
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </OriginMarketingPage>
  );
}

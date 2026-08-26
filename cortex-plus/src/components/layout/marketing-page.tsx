import Link from "next/link";
import { cn } from "@/lib/utils";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import "@/styles/origin-marketing.css";
import {
  ORIGIN_FEATURES_PAGE_ORDER,
  ORIGIN_FEATURE_LABELS,
  originFeatureBg,
} from "@/lib/origin/feature-colors";

export function MarketingPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <OriginMarketingPage title={title}>
      <div className="mx-auto max-w-[var(--page-max-width)] px-4 pb-16">
        {description ? (
          <p className="mb-8 max-w-2xl text-[var(--mk-muted)]">{description}</p>
        ) : null}
        {children}
      </div>
    </OriginMarketingPage>
  );
}

export function MarketingCta() {
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <Link href="/kayit" className={cn("mk-btn-primary inline-flex px-8 py-3 text-sm")}>
        Ücretsiz dene
      </Link>
      <Link href="/fiyatlandirma" className={cn("mk-btn-outline inline-flex px-8 py-3 text-sm")}>
        Plus satın al
      </Link>
    </div>
  );
}

export function OriginFeatureGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ORIGIN_FEATURES_PAGE_ORDER.map((key) => {
        const feature = ORIGIN_FEATURE_LABELS[key];
        return (
          <article
            key={key}
            className="mk-feature-tile"
            style={{ backgroundColor: originFeatureBg(key) }}
          >
            <h2>{feature.title}</h2>
            <p className="mt-2 text-base leading-relaxed text-white/90">{feature.body}</p>
          </article>
        );
      })}
    </div>
  );
}

export {
  OriginFormPanel,
  OriginInput,
  OriginLabel,
  OriginButton,
  OriginButtonOutline,
  OriginFormHint,
  OriginMarketingLink,
  OriginTextarea,
  originSelectTriggerClass,
} from "@/components/marketing/origin-form";

export {
  OriginCheckbox,
  OriginConsentRow,
  OriginSelectContent,
  OriginSelectItem,
} from "@/components/marketing/origin-form-controls";

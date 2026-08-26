import { MarketingPage } from "@/components/layout/marketing-page";

export function LegalDocument({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: { heading: string; body: string[] }[];
}) {
  return (
    <MarketingPage title={title} description={description}>
      <div className="max-w-2xl space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mk-prose-heading text-base">{section.heading}</h2>
            <ul className="mk-prose mt-2 space-y-2">
              {section.body.map((paragraph) => (
                <li key={paragraph}>{paragraph}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mk-hint text-xs">
          Bu metin bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez.
          Yayına almadan önce hukuk danışmanınla gözden geçirmeni öneririz.
        </p>
      </div>
    </MarketingPage>
  );
}

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
            <h2 className="font-medium">{section.heading}</h2>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {section.body.map((paragraph) => (
                <li key={paragraph}>{paragraph}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          Bu metin bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez.
          Yayına almadan önce hukuk danışmanınla gözden geçirmeni öneririz.
        </p>
      </div>
    </MarketingPage>
  );
}

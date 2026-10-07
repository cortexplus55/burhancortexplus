import { cva } from "class-variance-authority";

/**
 * Düğme sınıfları. "use client" olmayan ayrı dosyada: sunucu bileşenleri
 * (boş durum, hata durumu) bağlantıyı düğme gibi çizmek için bunu çağırıyor.
 * button.tsx içindeyken sunucudan çağrı "Attempted to call buttonVariants()
 * from the server" hatası verdi ve /tasarim 500 döndü (1 Ekim 2026); aynı
 * yol hiç verisi olmayan öğrencinin boş durum ekranlarındaydı.
 */
export const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-2 border border-transparent",
    "text-sm font-semibold whitespace-nowrap outline-none select-none",
    "transition-[background-color,transform,opacity,box-shadow] duration-fast ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
    "disabled:pointer-events-none disabled:opacity-45",
    "active:not-aria-[busy]:scale-[0.98]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "rounded-pill bg-action text-action-foreground shadow-glow-action hover:bg-action-hover active:bg-action-pressed",
        default:
          "rounded-pill bg-action text-action-foreground shadow-glow-action hover:bg-action-hover active:bg-action-pressed",
        secondary:
          "rounded-[var(--r-md)] border-[var(--c-border-strong)] bg-surface-2 text-[var(--c-text)] hover:bg-surface-3",
        ghost: "rounded-[var(--r-md)] bg-transparent text-[var(--c-text-muted)] hover:bg-surface-2 hover:text-[var(--c-text)]",
        danger: "rounded-pill bg-danger text-white hover:brightness-110",
        "danger-ghost":
          "rounded-[var(--r-md)] border border-danger/40 bg-transparent text-danger hover:bg-danger-soft",
        brand: "rounded-pill bg-brand text-brand-foreground hover:bg-brand-hover",
        outline:
          "rounded-[var(--r-md)] border border-[var(--c-border-strong)] bg-transparent text-[var(--c-text)] hover:bg-surface-2",
        destructive:
          "rounded-pill bg-danger text-white hover:brightness-110",
        link: "rounded-none bg-transparent text-action underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 min-h-9 px-3 text-sm",
        md: "h-11 min-h-11 px-4 text-sm",
        default: "h-11 min-h-11 px-4 text-sm",
        lg: "h-[52px] min-h-[52px] px-5 text-[15px]",
        xs: "h-8 min-h-8 px-2.5 text-xs",
        icon: "size-11 rounded-full",
        "icon-xs": "size-8 rounded-full",
        "icon-sm": "size-9 rounded-full",
        "icon-lg": "size-[52px] rounded-full",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      block: false,
    },
  }
);

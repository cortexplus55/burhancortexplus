"use client";

import Link from "next/link";
import { GrafikCiziciLab } from "@/components/lab/grafik-cizici";
import { PeriyodikTabloLab } from "@/components/lab/periyodik-tablo";
import { KuvvetHareketLab } from "@/components/lab/kuvvet-hareket";
import {
  AsitBazLab,
  DalgaLab,
  DenklemLab,
  DevreLab,
  EkosistemLab,
  FotosentezLab,
  GeometriLab,
  GunesLab,
  HucreLab,
  IntegralLab,
  MolekulLab,
  MomentumLab,
  OlasilikLab,
  RenkLab,
  TepkimeLab,
  TrigonometriLab,
} from "@/components/lab/lab-simulations";
import { FaizLab } from "@/components/lab/sims/faiz-lab";
import { EgikAtisLab } from "@/components/lab/sims/egik-atis";
import { SarkacLab } from "@/components/lab/sims/sarkac";
import { DalgaGirisimiLab } from "@/components/lab/sims/dalga-girisimi";
import { SerbestDususLab } from "@/components/lab/sims/serbest-dusus";
import { TurevTegetLab } from "@/components/lab/sims/turev-teget";
import { RiemannLab } from "@/components/lab/sims/riemann";
import { FonksiyonAnaliziLab } from "@/components/lab/sims/fonksiyon-analizi";
import { VektorlerLab } from "@/components/lab/sims/vektorler";
import { DonelCisimlerLab } from "@/components/lab/sims/donel-cisimler";

const LAB_COMPONENTS: Record<string, () => React.ReactNode> = {
  "donel-cisimler": DonelCisimlerLab,
  vektorler: VektorlerLab,
  "fonksiyon-analizi": FonksiyonAnaliziLab,
  riemann: RiemannLab,
  "turev-teget": TurevTegetLab,
  "serbest-dusus": SerbestDususLab,
  "dalga-girisimi": DalgaGirisimiLab,
  sarkac: SarkacLab,
  "egik-atis": EgikAtisLab,
  grafik: GrafikCiziciLab,
  periyodik: PeriyodikTabloLab,
  kuvvet: KuvvetHareketLab,
  denklem: DenklemLab,
  geometri: GeometriLab,
  integral: IntegralLab,
  trigonometri: TrigonometriLab,
  olasilik: OlasilikLab,
  faiz: FaizLab,
  renk: RenkLab,
  devre: DevreLab,
  gunes: GunesLab,
  dalga: DalgaLab,
  momentum: MomentumLab,
  molekul: MolekulLab,
  tepkime: TepkimeLab,
  asit: AsitBazLab,
  hucre: HucreLab,
  ekosistem: EkosistemLab,
  fotosentez: FotosentezLab,
};

export function LabAppBody({ id }: { id: string }) {
  const Component = LAB_COMPONENTS[id];
  if (!Component) {
    return (
      <>
        <p className="text-sm text-[var(--astra-muted)]">
          Bu uygulama henüz hazırlanıyor.
        </p>
        <Link
          href="/uygulamalar"
          className="astra-btn-primary mt-4 inline-block rounded-full px-4 py-2 text-sm"
        >
          Kataloğa dön
        </Link>
      </>
    );
  }
  return <Component />;
}

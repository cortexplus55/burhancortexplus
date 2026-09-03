/**
 * Periyodik tablo verisi — 118 element.
 *
 * Önceki hâlde 10 element vardı ve ekranda "tam tablo yakında genişletilecek"
 * yazıyordu. Eksik bir periyodik tablo periyodik tablo değil: tablonun bütün
 * öğretici gücü konumdan geliyor, eksik ızgarada o kayboluyor.
 *
 * Konumlar standart: lantanit ve aktinitler kendi satırlarında (period 8/9
 * olarak işaretli), diğerleri gerçek periyot/grup değerlerinde.
 */

export type ElementCategory =
  | "alkali"
  | "toprak-alkali"
  | "gecis"
  | "sonra-gecis"
  | "yari-metal"
  | "ametal"
  | "halojen"
  | "soy-gaz"
  | "lantanit"
  | "aktinit";

export type ChemElement = {
  z: number;
  symbol: string;
  name: string;
  mass: number;
  category: ElementCategory;
  /** 8 = lantanit satırı, 9 = aktinit satırı. */
  period: number;
  group: number;
};

export const CATEGORY_LABEL: Record<ElementCategory, string> = {
  alkali: "Alkali metal",
  "toprak-alkali": "Toprak alkali",
  gecis: "Geçiş metali",
  "sonra-gecis": "Geçiş sonrası metal",
  "yari-metal": "Yarı metal",
  ametal: "Ametal",
  halojen: "Halojen",
  "soy-gaz": "Soy gaz",
  lantanit: "Lantanit",
  aktinit: "Aktinit",
};

export const CATEGORY_COLOR: Record<ElementCategory, string> = {
  alkali: "#e0705a",
  "toprak-alkali": "#e0a44a",
  gecis: "#7aa2f7",
  "sonra-gecis": "#5ac8d8",
  "yari-metal": "#54c594",
  ametal: "#a8d84a",
  halojen: "#d8c04a",
  "soy-gaz": "#b07ae0",
  lantanit: "#e07ab0",
  aktinit: "#c07ae0",
};

type Row = [number, string, string, number, ElementCategory, number, number];

const RAW: Row[] = [
  [1, "H", "Hidrojen", 1.008, "ametal", 1, 1],
  [2, "He", "Helyum", 4.0026, "soy-gaz", 1, 18],
  [3, "Li", "Lityum", 6.94, "alkali", 2, 1],
  [4, "Be", "Berilyum", 9.0122, "toprak-alkali", 2, 2],
  [5, "B", "Bor", 10.81, "yari-metal", 2, 13],
  [6, "C", "Karbon", 12.011, "ametal", 2, 14],
  [7, "N", "Azot", 14.007, "ametal", 2, 15],
  [8, "O", "Oksijen", 15.999, "ametal", 2, 16],
  [9, "F", "Flor", 18.998, "halojen", 2, 17],
  [10, "Ne", "Neon", 20.18, "soy-gaz", 2, 18],
  [11, "Na", "Sodyum", 22.99, "alkali", 3, 1],
  [12, "Mg", "Magnezyum", 24.305, "toprak-alkali", 3, 2],
  [13, "Al", "Alüminyum", 26.982, "sonra-gecis", 3, 13],
  [14, "Si", "Silisyum", 28.085, "yari-metal", 3, 14],
  [15, "P", "Fosfor", 30.974, "ametal", 3, 15],
  [16, "S", "Kükürt", 32.06, "ametal", 3, 16],
  [17, "Cl", "Klor", 35.45, "halojen", 3, 17],
  [18, "Ar", "Argon", 39.948, "soy-gaz", 3, 18],
  [19, "K", "Potasyum", 39.098, "alkali", 4, 1],
  [20, "Ca", "Kalsiyum", 40.078, "toprak-alkali", 4, 2],
  [21, "Sc", "Skandiyum", 44.956, "gecis", 4, 3],
  [22, "Ti", "Titanyum", 47.867, "gecis", 4, 4],
  [23, "V", "Vanadyum", 50.942, "gecis", 4, 5],
  [24, "Cr", "Krom", 51.996, "gecis", 4, 6],
  [25, "Mn", "Mangan", 54.938, "gecis", 4, 7],
  [26, "Fe", "Demir", 55.845, "gecis", 4, 8],
  [27, "Co", "Kobalt", 58.933, "gecis", 4, 9],
  [28, "Ni", "Nikel", 58.693, "gecis", 4, 10],
  [29, "Cu", "Bakır", 63.546, "gecis", 4, 11],
  [30, "Zn", "Çinko", 65.38, "gecis", 4, 12],
  [31, "Ga", "Galyum", 69.723, "sonra-gecis", 4, 13],
  [32, "Ge", "Germanyum", 72.63, "yari-metal", 4, 14],
  [33, "As", "Arsenik", 74.922, "yari-metal", 4, 15],
  [34, "Se", "Selenyum", 78.971, "ametal", 4, 16],
  [35, "Br", "Brom", 79.904, "halojen", 4, 17],
  [36, "Kr", "Kripton", 83.798, "soy-gaz", 4, 18],
  [37, "Rb", "Rubidyum", 85.468, "alkali", 5, 1],
  [38, "Sr", "Stronsiyum", 87.62, "toprak-alkali", 5, 2],
  [39, "Y", "İtriyum", 88.906, "gecis", 5, 3],
  [40, "Zr", "Zirkonyum", 91.224, "gecis", 5, 4],
  [41, "Nb", "Niyobyum", 92.906, "gecis", 5, 5],
  [42, "Mo", "Molibden", 95.95, "gecis", 5, 6],
  [43, "Tc", "Teknesyum", 98, "gecis", 5, 7],
  [44, "Ru", "Rutenyum", 101.07, "gecis", 5, 8],
  [45, "Rh", "Rodyum", 102.91, "gecis", 5, 9],
  [46, "Pd", "Paladyum", 106.42, "gecis", 5, 10],
  [47, "Ag", "Gümüş", 107.87, "gecis", 5, 11],
  [48, "Cd", "Kadmiyum", 112.41, "gecis", 5, 12],
  [49, "In", "İndiyum", 114.82, "sonra-gecis", 5, 13],
  [50, "Sn", "Kalay", 118.71, "sonra-gecis", 5, 14],
  [51, "Sb", "Antimon", 121.76, "yari-metal", 5, 15],
  [52, "Te", "Tellür", 127.6, "yari-metal", 5, 16],
  [53, "I", "İyot", 126.9, "halojen", 5, 17],
  [54, "Xe", "Ksenon", 131.29, "soy-gaz", 5, 18],
  [55, "Cs", "Sezyum", 132.91, "alkali", 6, 1],
  [56, "Ba", "Baryum", 137.33, "toprak-alkali", 6, 2],
  [57, "La", "Lantan", 138.91, "lantanit", 8, 3],
  [58, "Ce", "Seryum", 140.12, "lantanit", 8, 4],
  [59, "Pr", "Praseodim", 140.91, "lantanit", 8, 5],
  [60, "Nd", "Neodim", 144.24, "lantanit", 8, 6],
  [61, "Pm", "Prometyum", 145, "lantanit", 8, 7],
  [62, "Sm", "Samaryum", 150.36, "lantanit", 8, 8],
  [63, "Eu", "Evropiyum", 151.96, "lantanit", 8, 9],
  [64, "Gd", "Gadolinyum", 157.25, "lantanit", 8, 10],
  [65, "Tb", "Terbiyum", 158.93, "lantanit", 8, 11],
  [66, "Dy", "Disprosyum", 162.5, "lantanit", 8, 12],
  [67, "Ho", "Holmiyum", 164.93, "lantanit", 8, 13],
  [68, "Er", "Erbiyum", 167.26, "lantanit", 8, 14],
  [69, "Tm", "Tulyum", 168.93, "lantanit", 8, 15],
  [70, "Yb", "İterbiyum", 173.05, "lantanit", 8, 16],
  [71, "Lu", "Lutesyum", 174.97, "lantanit", 8, 17],
  [72, "Hf", "Hafniyum", 178.49, "gecis", 6, 4],
  [73, "Ta", "Tantal", 180.95, "gecis", 6, 5],
  [74, "W", "Tungsten", 183.84, "gecis", 6, 6],
  [75, "Re", "Renyum", 186.21, "gecis", 6, 7],
  [76, "Os", "Osmiyum", 190.23, "gecis", 6, 8],
  [77, "Ir", "İridyum", 192.22, "gecis", 6, 9],
  [78, "Pt", "Platin", 195.08, "gecis", 6, 10],
  [79, "Au", "Altın", 196.97, "gecis", 6, 11],
  [80, "Hg", "Cıva", 200.59, "gecis", 6, 12],
  [81, "Tl", "Talyum", 204.38, "sonra-gecis", 6, 13],
  [82, "Pb", "Kurşun", 207.2, "sonra-gecis", 6, 14],
  [83, "Bi", "Bizmut", 208.98, "sonra-gecis", 6, 15],
  [84, "Po", "Polonyum", 209, "yari-metal", 6, 16],
  [85, "At", "Astatin", 210, "halojen", 6, 17],
  [86, "Rn", "Radon", 222, "soy-gaz", 6, 18],
  [87, "Fr", "Fransiyum", 223, "alkali", 7, 1],
  [88, "Ra", "Radyum", 226, "toprak-alkali", 7, 2],
  [89, "Ac", "Aktinyum", 227, "aktinit", 9, 3],
  [90, "Th", "Toryum", 232.04, "aktinit", 9, 4],
  [91, "Pa", "Protaktinyum", 231.04, "aktinit", 9, 5],
  [92, "U", "Uranyum", 238.03, "aktinit", 9, 6],
  [93, "Np", "Neptünyum", 237, "aktinit", 9, 7],
  [94, "Pu", "Plütonyum", 244, "aktinit", 9, 8],
  [95, "Am", "Amerikyum", 243, "aktinit", 9, 9],
  [96, "Cm", "Küriyum", 247, "aktinit", 9, 10],
  [97, "Bk", "Berkelyum", 247, "aktinit", 9, 11],
  [98, "Cf", "Kaliforniyum", 251, "aktinit", 9, 12],
  [99, "Es", "Aynştaynyum", 252, "aktinit", 9, 13],
  [100, "Fm", "Fermiyum", 257, "aktinit", 9, 14],
  [101, "Md", "Mendelevyum", 258, "aktinit", 9, 15],
  [102, "No", "Nobelyum", 259, "aktinit", 9, 16],
  [103, "Lr", "Lavrensiyum", 266, "aktinit", 9, 17],
  [104, "Rf", "Rutherfordyum", 267, "gecis", 7, 4],
  [105, "Db", "Dubniyum", 268, "gecis", 7, 5],
  [106, "Sg", "Seaborgiyum", 269, "gecis", 7, 6],
  [107, "Bh", "Bohriyum", 270, "gecis", 7, 7],
  [108, "Hs", "Hassiyum", 269, "gecis", 7, 8],
  [109, "Mt", "Meitneriyum", 278, "gecis", 7, 9],
  [110, "Ds", "Darmstadtiyum", 281, "gecis", 7, 10],
  [111, "Rg", "Röntgenyum", 282, "gecis", 7, 11],
  [112, "Cn", "Kopernikyum", 285, "gecis", 7, 12],
  [113, "Nh", "Nihonyum", 286, "sonra-gecis", 7, 13],
  [114, "Fl", "Flerovyum", 289, "sonra-gecis", 7, 14],
  [115, "Mc", "Moskovyum", 290, "sonra-gecis", 7, 15],
  [116, "Lv", "Livermoryum", 293, "sonra-gecis", 7, 16],
  [117, "Ts", "Tennessin", 294, "halojen", 7, 17],
  [118, "Og", "Oganesson", 294, "soy-gaz", 7, 18],
];

export const ELEMENTS: ChemElement[] = RAW.map(
  ([z, symbol, name, mass, category, period, group]) => ({
    z,
    symbol,
    name,
    mass,
    category,
    period,
    group,
  }),
);

/** Elektron kabuk dağılımı — 2, 8, 18, 32 kapasiteleriyle basit dolum. */
export function shells(z: number): number[] {
  const caps = [2, 8, 18, 32, 32, 18, 8];
  const out: number[] = [];
  let left = z;
  for (const cap of caps) {
    if (left <= 0) break;
    const take = Math.min(cap, left);
    out.push(take);
    left -= take;
  }
  return out;
}

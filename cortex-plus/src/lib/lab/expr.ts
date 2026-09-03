/**
 * Küçük matematik ifadesi ayrıştırıcısı.
 *
 * `eval` ya da `new Function` KULLANILMIYOR. Öğrencinin yazdığı metin
 * doğrudan çalıştırılsaydı, paylaşılan bir bağlantıyla başkasının tarayıcısında
 * kod çalıştırmak mümkün olurdu. Burada metin önce belirteçlere, sonra
 * shunting-yard ile ters Lehçe gösterime çevriliyor; değerlendirme yalnızca
 * bilinen işleç ve fonksiyonları tanıyor.
 *
 * Desteklenen: + - * / ^ , parantez, tek değişken (x), sabitler (pi, e),
 * fonksiyonlar (sin cos tan asin acos atan sqrt abs ln log exp floor ceil round).
 * Örtük çarpım da kabul ediliyor: "2x", "3sin(x)", "(x+1)(x-1)".
 */

export type Expr = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token =
  | { t: "num"; v: number }
  | { t: "var" }
  | { t: "op"; v: string }
  | { t: "func"; v: string }
  | { t: "lp" }
  | { t: "rp" };

const PREC: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "u-": 2.5,
  "^": 3,
};
const RIGHT = new Set(["^", "u-"]);
const UNARY = new Set(["u-"]);

function tokenize(input: string): Token[] | null {
  const s = input.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  const out: Token[] = [];
  let i = 0;

  const needsImplicitTimes = () => {
    const prev = out[out.length - 1];
    return !!prev && (prev.t === "num" || prev.t === "var" || prev.t === "rp");
  };

  while (i < s.length) {
    const c = s[i];

    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(s.slice(i));
      if (!m) return null;
      if (needsImplicitTimes()) out.push({ t: "op", v: "*" });
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }

    if (/[a-z]/.test(c)) {
      const m = /^[a-z]+/.exec(s.slice(i));
      if (!m) return null;
      const word = m[0];
      i += word.length;

      if (word === "x") {
        if (needsImplicitTimes()) out.push({ t: "op", v: "*" });
        out.push({ t: "var" });
      } else if (word in CONSTS) {
        if (needsImplicitTimes()) out.push({ t: "op", v: "*" });
        out.push({ t: "num", v: CONSTS[word] });
      } else if (word in FUNCS) {
        if (needsImplicitTimes()) out.push({ t: "op", v: "*" });
        out.push({ t: "func", v: word });
      } else {
        return null;
      }
      continue;
    }

    if (c === "(") {
      if (needsImplicitTimes()) out.push({ t: "op", v: "*" });
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (c in PREC) {
      // Tekil eksi/artı: başta ya da bir işleçten/parantezden hemen sonra.
      const prev = out[out.length - 1];
      const unary =
        (c === "-" || c === "+") &&
        (!prev || prev.t === "op" || prev.t === "lp" || prev.t === "func");
      if (unary) {
        // Tekil arti hicbir sey yapmiyor, atiyoruz.
        if (c === "-") out.push({ t: "op", v: "u-" });
        i++;
        continue;
      }
      out.push({ t: "op", v: c });
      i++;
      continue;
    }

    return null;
  }

  return out;
}

/** Shunting-yard: belirteçleri ters Lehçe gösterime çevirir. */
function toRpn(tokens: Token[]): Token[] | null {
  const out: Token[] = [];
  const stack: Token[] = [];

  for (const tk of tokens) {
    if (tk.t === "num" || tk.t === "var") {
      out.push(tk);
    } else if (tk.t === "func") {
      stack.push(tk);
    } else if (tk.t === "op") {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.t === "func") {
          out.push(stack.pop()!);
          continue;
        }
        if (
          top.t === "op" &&
          (PREC[top.v] > PREC[tk.v] ||
            (PREC[top.v] === PREC[tk.v] && !RIGHT.has(tk.v)))
        ) {
          out.push(stack.pop()!);
          continue;
        }
        break;
      }
      stack.push(tk);
    } else if (tk.t === "lp") {
      stack.push(tk);
    } else {
      let found = false;
      while (stack.length) {
        const top = stack.pop()!;
        if (top.t === "lp") {
          found = true;
          break;
        }
        out.push(top);
      }
      if (!found) return null;
      const top = stack[stack.length - 1];
      if (top?.t === "func") out.push(stack.pop()!);
    }
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === "lp") return null;
    out.push(top);
  }
  return out;
}

/**
 * Metni değerlendirilebilir bir fonksiyona çevirir. Geçersiz ifadede null
 * döner — arayüz bunu "ifadeyi anlayamadım" diye gösteriyor, sessizce
 * NaN üretmiyor.
 */
export function compile(input: string): Expr | null {
  const tokens = tokenize(input);
  if (!tokens || !tokens.length) return null;
  const rpn = toRpn(tokens);
  if (!rpn || !rpn.length) return null;

  // Bir kez deneyerek yapısal geçerliliği doğrula.
  const probe = evaluate(rpn, 1);
  if (probe === null) return null;

  return (x: number) => {
    const v = evaluate(rpn, x);
    return v === null ? NaN : v;
  };
}

function evaluate(rpn: Token[], x: number): number | null {
  const st: number[] = [];
  for (const tk of rpn) {
    if (tk.t === "num") st.push(tk.v);
    else if (tk.t === "var") st.push(x);
    else if (tk.t === "func") {
      const a = st.pop();
      if (a === undefined) return null;
      st.push(FUNCS[tk.v](a));
    } else if (tk.t === "op") {
      if (UNARY.has(tk.v)) {
        const a = st.pop();
        if (a === undefined) return null;
        st.push(-a);
        continue;
      }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) return null;
      switch (tk.v) {
        case "+":
          st.push(a + b);
          break;
        case "-":
          st.push(a - b);
          break;
        case "*":
          st.push(a * b);
          break;
        case "/":
          st.push(a / b);
          break;
        case "^":
          st.push(Math.pow(a, b));
          break;
        default:
          return null;
      }
    } else {
      return null;
    }
  }
  return st.length === 1 ? st[0] : null;
}

/**
 * Sayısal türev — merkezi fark.
 *
 * Analitik türev almıyoruz: sembolik türev için ayrı bir cebir katmanı
 * gerekirdi ve grafik çizmek için gereken doğruluk merkezi farkla fazlasıyla
 * sağlanıyor. h, x ölçeğine göre seçiliyor; sabit h büyük x'lerde duyarlık
 * kaybediyor.
 */
export function derivative(f: Expr, x: number, order: 1 | 2 = 1): number {
  const h = Math.max(1e-5, Math.abs(x) * 1e-5);
  if (order === 1) return (f(x + h) - f(x - h)) / (2 * h);
  return (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
}

/** Belirli integral — Simpson kuralı, çift sayıda aralıkla. */
export function integrate(f: Expr, a: number, b: number, n = 200): number {
  const steps = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / steps;
  let sum = f(a) + f(b);
  for (let i = 1; i < steps; i++) {
    sum += f(a + i * h) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * h) / 3;
}

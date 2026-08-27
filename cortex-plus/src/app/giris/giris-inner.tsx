"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signInWithGoogle } from "@/lib/auth/google-oauth";
import { toast } from "sonner";

export default function GirisPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/ogretmen";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Giriş başarısız. Bilgilerinizi kontrol edin.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function google() {
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await signInWithGoogle(
      supabase,
      `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    );
    if (error) toast.error("Google ile giriş başlatılamadı.");
  }

  return (
    <AstraMarketingPage variant="auth" title="Giriş yap">
      <form onSubmit={onSubmit} className="mk-card mx-auto max-w-md space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Şifre</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          Giriş yap
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={google}>
          Google ile devam et
        </Button>
        <p className="text-sm text-muted-foreground">
          <Link href="/sifremi-unuttum" className="underline">
            Şifremi unuttum
          </Link>
          {" · "}
          <Link href="/kayit" className="underline">
            Kayıt ol
          </Link>
        </p>
      </form>
    </AstraMarketingPage>
  );
}

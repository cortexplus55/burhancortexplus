import { AstraAppChrome } from "@/components/parity/astra-app-chrome";
import { astraUserInitial } from "@/components/parity/astra-app-utils";
import { createClient } from "@/lib/supabase/server";

export async function ParentShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const avatar = profile?.avatar_url as string | null | undefined;

  return (
    <AstraAppChrome
      navRole="parent"
      pageTitle={title}
      avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
      userInitial={astraUserInitial(profile?.full_name, user?.email)}
    >
      {children}
    </AstraAppChrome>
  );
}

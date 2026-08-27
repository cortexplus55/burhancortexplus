-- Signup completeSignup upsert: kullanıcı kendi profil satırını ekleyebilir (tetikleyici gecikmesi).
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

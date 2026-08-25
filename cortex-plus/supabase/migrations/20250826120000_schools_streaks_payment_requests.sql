-- Okul arama, günlük seri, veli ödeme isteği

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  district text,
  school_type text,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(district, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schools_name_trgm ON public.schools USING gin (name gin_trgm_ops);

CREATE INDEX schools_search ON public.schools USING gin (search_vector);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY schools_read ON public.schools FOR SELECT TO authenticated USING (true);

INSERT INTO public.schools (name, city, district, school_type) VALUES
  ('Atatürk Anadolu Lisesi', 'İstanbul', 'Kadıköy', 'lise'),
  ('Cumhuriyet Anadolu Lisesi', 'Ankara', 'Çankaya', 'lise'),
  ('Fen Lisesi', 'İzmir', 'Bornova', 'lise'),
  ('Gazi Anadolu Lisesi', 'Bursa', 'Nilüfer', 'lise'),
  ('İstiklal Ortaokulu', 'Antalya', 'Muratpaşa', 'ortaokul'),
  ('Mehmet Akif Ersoy Lisesi', 'Konya', 'Selçuklu', 'lise'),
  ('Mimar Sinan Anadolu Lisesi', 'İstanbul', 'Üsküdar', 'lise'),
  ('Şehit Öğretmen Ortaokulu', 'Gaziantep', 'Şahinbey', 'ortaokul'),
  ('TED Koleji', 'Ankara', 'Çankaya', 'kolej'),
  ('Ted Rönesans Koleji', 'İstanbul', 'Beşiktaş', 'kolej'),
  ('Vefa Lisesi', 'İstanbul', 'Fatih', 'lise'),
  ('Yunus Emre Ortaokulu', 'Eskişehir', 'Tepebaşı', 'ortaokul');

CREATE TABLE public.user_streaks (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak int NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak int NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_activity_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_activity_days (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  source text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_date)
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_streaks_own ON public.user_streaks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_activity_own ON public.user_activity_days
  FOR SELECT USING (user_id = auth.uid());

CREATE TABLE public.parent_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX parent_payment_requests_student ON public.parent_payment_requests (student_id, status);
CREATE INDEX parent_payment_requests_parent ON public.parent_payment_requests (parent_id, status);

ALTER TABLE public.parent_payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ppr_student_insert ON public.parent_payment_requests
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY ppr_student_read ON public.parent_payment_requests
  FOR SELECT USING (
    student_id = auth.uid()
    OR parent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links l
      WHERE l.status = 'active'
        AND l.student_id = parent_payment_requests.student_id
        AND l.parent_id = auth.uid()
    )
  );

CREATE POLICY ppr_parent_update ON public.parent_payment_requests
  FOR UPDATE USING (
    parent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_student_links l
      WHERE l.status = 'active'
        AND l.student_id = parent_payment_requests.student_id
        AND l.parent_id = auth.uid()
    )
  );

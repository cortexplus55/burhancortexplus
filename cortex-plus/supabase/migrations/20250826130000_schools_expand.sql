-- Genişletilmiş okul seed (81 il — il başına temsili kayıtlar)
-- Resmi MEB kodu yok; CSV import için docs/product/meb-schools.md

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS meb_code text;

CREATE UNIQUE INDEX IF NOT EXISTS schools_meb_code_idx ON public.schools (meb_code) WHERE meb_code IS NOT NULL;

INSERT INTO public.schools (name, city, district, school_type)
SELECT
  format('%s %s', city, suffix),
  city,
  district,
  stype
FROM (
  VALUES
    ('Adana', 'Seyhan', 'lise'),
    ('Adıyaman', 'Merkez', 'lise'),
    ('Afyonkarahisar', 'Merkez', 'lise'),
    ('Ağrı', 'Merkez', 'lise'),
    ('Amasya', 'Merkez', 'lise'),
    ('Ankara', 'Çankaya', 'lise'),
    ('Antalya', 'Muratpaşa', 'lise'),
    ('Artvin', 'Merkez', 'lise'),
    ('Aydın', 'Efeler', 'lise'),
    ('Balıkesir', 'Karesi', 'lise'),
    ('Bilecik', 'Merkez', 'lise'),
    ('Bingöl', 'Merkez', 'lise'),
    ('Bitlis', 'Merkez', 'lise'),
    ('Bolu', 'Merkez', 'lise'),
    ('Burdur', 'Merkez', 'lise'),
    ('Bursa', 'Nilüfer', 'lise'),
    ('Çanakkale', 'Merkez', 'lise'),
    ('Çankırı', 'Merkez', 'lise'),
    ('Çorum', 'Merkez', 'lise'),
    ('Denizli', 'Merkez', 'lise'),
    ('Diyarbakır', 'Bağlar', 'lise'),
    ('Edirne', 'Merkez', 'lise'),
    ('Elazığ', 'Merkez', 'lise'),
    ('Erzincan', 'Merkez', 'lise'),
    ('Erzurum', 'Yakutiye', 'lise'),
    ('Eskişehir', 'Tepebaşı', 'lise'),
    ('Gaziantep', 'Şahinbey', 'lise'),
    ('Giresun', 'Merkez', 'lise'),
    ('Gümüşhane', 'Merkez', 'lise'),
    ('Hakkari', 'Merkez', 'lise'),
    ('Hatay', 'Antakya', 'lise'),
    ('Isparta', 'Merkez', 'lise'),
    ('Mersin', 'Yenişehir', 'lise'),
    ('İstanbul', 'Kadıköy', 'lise'),
    ('İzmir', 'Konak', 'lise'),
    ('Kars', 'Merkez', 'lise'),
    ('Kastamonu', 'Merkez', 'lise'),
    ('Kayseri', 'Melikgazi', 'lise'),
    ('Kırklareli', 'Merkez', 'lise'),
    ('Kırşehir', 'Merkez', 'lise'),
    ('Kocaeli', 'İzmit', 'lise'),
    ('Konya', 'Selçuklu', 'lise'),
    ('Kütahya', 'Merkez', 'lise'),
    ('Malatya', 'Battalgazi', 'lise'),
    ('Manisa', 'Yunusemre', 'lise'),
    ('Kahramanmaraş', 'Onikişubat', 'lise'),
    ('Mardin', 'Artuklu', 'lise'),
    ('Muğla', 'Menteşe', 'lise'),
    ('Muş', 'Merkez', 'lise'),
    ('Nevşehir', 'Merkez', 'lise'),
    ('Niğde', 'Merkez', 'lise'),
    ('Ordu', 'Altınordu', 'lise'),
    ('Osmaniye', 'Merkez', 'lise'),
    ('Rize', 'Merkez', 'lise'),
    ('Sakarya', 'Adapazarı', 'lise'),
    ('Samsun', 'İlkadım', 'lise'),
    ('Siirt', 'Merkez', 'lise'),
    ('Sinop', 'Merkez', 'lise'),
    ('Sivas', 'Merkez', 'lise'),
    ('Tekirdağ', 'Süleymanpaşa', 'lise'),
    ('Tokat', 'Merkez', 'lise'),
    ('Trabzon', 'Ortahisar', 'lise'),
    ('Tunceli', 'Merkez', 'lise'),
    ('Şanlıurfa', 'Haliliye', 'lise'),
    ('Uşak', 'Merkez', 'lise'),
    ('Van', 'İpekyolu', 'lise'),
    ('Yozgat', 'Merkez', 'lise'),
    ('Zonguldak', 'Merkez', 'lise'),
    ('Aksaray', 'Merkez', 'lise'),
    ('Bayburt', 'Merkez', 'lise'),
    ('Karaman', 'Merkez', 'lise'),
    ('Kırıkkale', 'Merkez', 'lise'),
    ('Batman', 'Merkez', 'lise'),
    ('Şırnak', 'Merkez', 'lise'),
    ('Bartın', 'Merkez', 'lise'),
    ('Ardahan', 'Merkez', 'lise'),
    ('Iğdır', 'Merkez', 'lise'),
    ('Yalova', 'Merkez', 'lise'),
    ('Karabük', 'Merkez', 'lise'),
    ('Kilis', 'Merkez', 'lise'),
    ('Osmaniye', 'Merkez', 'ortaokul'),
    ('Düzce', 'Merkez', 'lise')
) AS t(city, district, stype)
CROSS JOIN (
  VALUES
    ('Atatürk Anadolu Lisesi'),
    ('Cumhuriyet Anadolu Lisesi'),
    ('Fen Lisesi'),
    ('İmam Hatip Lisesi'),
    ('Anadolu Lisesi')
) AS s(suffix)
WHERE NOT EXISTS (
  SELECT 1 FROM public.schools sc
  WHERE sc.name = format('%s %s', city, suffix) AND sc.city = city
);

-- İstanbul / Ankara ek çeşitlilik
INSERT INTO public.schools (name, city, district, school_type) VALUES
  ('Galatasaray Lisesi', 'İstanbul', 'Beyoğlu', 'lise'),
  ('Robert Kolej', 'İstanbul', 'Beşiktaş', 'kolej'),
  ('Koç Üniversitesi Okulları', 'İstanbul', 'Sarıyer', 'kolej'),
  ('TED Ankara Koleji', 'Ankara', 'Çankaya', 'kolej'),
  ('ODTÜ Geliştirme Vakfı Okulları', 'Ankara', 'Çankaya', 'kolej');

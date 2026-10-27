-- Çizimli video özeti (27 Ekim 2026). Sahne resmi yok; stil adı sketch_reel.
-- Eski resimli videoların stilleri durur.

ALTER TABLE public.prep_videos DROP CONSTRAINT IF EXISTS prep_videos_style_check;
ALTER TABLE public.prep_videos ADD CONSTRAINT prep_videos_style_check
  CHECK (style IN (
    'realistic', 'comic', 'whiteboard', 'brainrot', 'meme',
    'cinematic', 'infographic', 'fast_focus',
    'sketch_reel'
  ));

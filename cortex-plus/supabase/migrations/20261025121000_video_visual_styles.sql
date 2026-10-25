-- Video ders görsel stilleri (25 Ekim 2026): cinematic / infographic / fast_focus.
-- Eski realistic / brainrot / meme satırları geçerli kalır; kod okurken eşler.

ALTER TABLE public.prep_videos DROP CONSTRAINT IF EXISTS prep_videos_style_check;
ALTER TABLE public.prep_videos ADD CONSTRAINT prep_videos_style_check
  CHECK (style IN (
    'realistic', 'comic', 'whiteboard', 'brainrot', 'meme',
    'cinematic', 'infographic', 'fast_focus'
  ));

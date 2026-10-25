CREATE TABLE IF NOT EXISTS public.stars (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS stars_template_id_idx
  ON public.stars (template_id);

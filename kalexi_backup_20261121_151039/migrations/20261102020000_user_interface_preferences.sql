CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_mode text NOT NULL DEFAULT 'light'
    CHECK (theme_mode IN ('light', 'dark', 'system')),
  density text NOT NULL DEFAULT 'comfortable'
    CHECK (density IN ('comfortable', 'compact')),
  accent text NOT NULL DEFAULT 'kalexi'
    CHECK (accent IN ('kalexi', 'ocean', 'forest', 'violet', 'gold')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

DROP POLICY IF EXISTS user_preferences_self_read ON public.user_preferences;
CREATE POLICY user_preferences_self_read ON public.user_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_self_insert ON public.user_preferences;
CREATE POLICY user_preferences_self_insert ON public.user_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_preferences_self_update ON public.user_preferences;
CREATE POLICY user_preferences_self_update ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS user_preferences_touch_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_touch_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

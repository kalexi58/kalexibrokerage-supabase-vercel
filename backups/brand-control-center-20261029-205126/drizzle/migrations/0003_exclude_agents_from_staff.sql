CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'active')
     AND NOT EXISTS (SELECT 1 FROM public.agents WHERE user_id = _user_id);
$$;
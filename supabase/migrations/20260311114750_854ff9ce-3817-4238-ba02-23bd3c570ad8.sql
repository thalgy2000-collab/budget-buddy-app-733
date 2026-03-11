-- Create timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT NOT NULL DEFAULT 'Circle',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Budget entries table
CREATE TABLE public.budget_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  planned NUMERIC NOT NULL DEFAULT 0,
  actual NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  installments INT,
  current_installment INT,
  due_date TEXT,
  paid BOOLEAN DEFAULT false,
  sub_items JSONB DEFAULT '[]',
  history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id, month)
);

ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entries" ON public.budget_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries" ON public.budget_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON public.budget_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries" ON public.budget_entries FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_budget_entries_updated_at BEFORE UPDATE ON public.budget_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
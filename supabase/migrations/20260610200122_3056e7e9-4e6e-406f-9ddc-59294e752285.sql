
CREATE TABLE public.labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  class_type TEXT NOT NULL,
  alcohol_content TEXT,
  net_contents TEXT,
  government_warning TEXT,
  image_url TEXT,
  brand_name_norm TEXT GENERATED ALWAYS AS (lower(trim(brand_name))) STORED,
  class_type_norm TEXT GENERATED ALWAYS AS (lower(trim(class_type))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX labels_brand_class_unique ON public.labels (brand_name_norm, class_type_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels TO anon, authenticated;
GRANT ALL ON public.labels TO service_role;

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read labels" ON public.labels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert labels" ON public.labels FOR INSERT TO anon, authenticated WITH CHECK (true);

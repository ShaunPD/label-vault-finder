
CREATE POLICY "Public read labels bucket" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'labels');
CREATE POLICY "Public upload labels bucket" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'labels');

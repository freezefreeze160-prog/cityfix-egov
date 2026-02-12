-- Create storage bucket for request photos
insert into storage.buckets (id, name, public)
values ('request-photos', 'request-photos', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload files
create policy "storage_upload_authenticated" on storage.objects
  for insert with check (
    bucket_id = 'request-photos' and auth.uid() is not null
  );

-- Allow public read access for photos
create policy "storage_read_public" on storage.objects
  for select using (
    bucket_id = 'request-photos'
  );

-- Allow users to delete their own uploads
create policy "storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'request-photos' and auth.uid()::text = (storage.foldername(name))[1]
  );

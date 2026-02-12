-- Create request_updates table for activity log
create table if not exists public.request_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status public.request_status,
  comment text,
  photo_url text,
  created_at timestamptz default now()
);

alter table public.request_updates enable row level security;

-- Citizens can view updates on their own requests
create policy "updates_citizen_select" on public.request_updates
  for select using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_id and sr.citizen_id = auth.uid()
    )
  );

-- Workers can view and insert updates on their assigned requests
create policy "updates_worker_select" on public.request_updates
  for select using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_id and sr.assigned_worker_id = auth.uid()
    )
  );

create policy "updates_worker_insert" on public.request_updates
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_id and sr.assigned_worker_id = auth.uid()
    )
  );

-- Admins can do everything with updates
create policy "updates_admin_select" on public.request_updates
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "updates_admin_insert" on public.request_updates
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Citizens can insert updates (comments) on their own requests
create policy "updates_citizen_insert" on public.request_updates
  for insert with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.service_requests sr
      where sr.id = request_id and sr.citizen_id = auth.uid()
    )
  );

-- Index for fast lookups
create index if not exists idx_updates_request on public.request_updates(request_id);
create index if not exists idx_updates_user on public.request_updates(user_id);

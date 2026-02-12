-- Create service requests table
create type public.request_status as enum ('submitted', 'assigned', 'in_progress', 'resolved', 'closed');
create type public.request_priority as enum ('low', 'medium', 'high', 'urgent');

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category_id uuid not null references public.categories(id),
  status public.request_status not null default 'submitted',
  priority public.request_priority not null default 'medium',
  citizen_id uuid not null references public.profiles(id),
  assigned_worker_id uuid references public.profiles(id),
  latitude double precision,
  longitude double precision,
  address text,
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.service_requests enable row level security;

-- Citizens can view their own requests
create policy "requests_citizen_select" on public.service_requests
  for select using (auth.uid() = citizen_id);

-- Citizens can insert their own requests
create policy "requests_citizen_insert" on public.service_requests
  for insert with check (auth.uid() = citizen_id);

-- Workers can view their assigned requests
create policy "requests_worker_select" on public.service_requests
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'worker'
    ) and assigned_worker_id = auth.uid()
  );

-- Workers can update their assigned requests (status changes)
create policy "requests_worker_update" on public.service_requests
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'worker'
    ) and assigned_worker_id = auth.uid()
  );

-- Admins can do everything
create policy "requests_admin_select" on public.service_requests
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "requests_admin_insert" on public.service_requests
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "requests_admin_update" on public.service_requests
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "requests_admin_delete" on public.service_requests
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Index for common queries
create index if not exists idx_requests_citizen on public.service_requests(citizen_id);
create index if not exists idx_requests_worker on public.service_requests(assigned_worker_id);
create index if not exists idx_requests_status on public.service_requests(status);
create index if not exists idx_requests_category on public.service_requests(category_id);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger service_requests_updated_at
  before update on public.service_requests
  for each row
  execute function public.update_updated_at();

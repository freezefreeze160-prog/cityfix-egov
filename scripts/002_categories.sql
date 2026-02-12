-- Create categories table for service request types
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  description text
);

alter table public.categories enable row level security;

-- Anyone authenticated can read categories
create policy "categories_select_authenticated" on public.categories
  for select using (auth.uid() is not null);

-- Seed default categories
insert into public.categories (name, icon, description) values
  ('Pothole', 'circle-dot', 'Road potholes and pavement damage'),
  ('Streetlight', 'lightbulb', 'Broken or flickering streetlights'),
  ('Trash / Illegal Dumping', 'trash-2', 'Illegal dumping or overflowing bins'),
  ('Water Leak', 'droplets', 'Water main leaks or flooding'),
  ('Graffiti', 'paintbrush', 'Graffiti or vandalism on public property'),
  ('Noise Complaint', 'volume-2', 'Excessive noise disturbances'),
  ('Sidewalk Damage', 'footprints', 'Cracked or broken sidewalks'),
  ('Other', 'help-circle', 'Other city service requests')
on conflict (name) do nothing;

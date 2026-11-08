-- CLASSEEQ admin system: run once in Supabase > SQL Editor (existing project).
-- Safe to re-run. Uses only the standard schema objects; never needs the service_role key in the website.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.categories (
  name text primary key check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
insert into public.categories(name) values ('Native Wear'),('Embroidery'),('Fabrics') on conflict do nothing;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  price numeric(12,2) check (price is null or price >= 0),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null references public.categories(name) on update cascade on delete restrict,
  sizes text[] not null default '{}',
  colours text[] not null default '{}',
  images text[] not null default '{}',
  is_new boolean not null default false,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  in_stock boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_pub_idx on public.products (is_published, created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;

drop policy if exists "admin reads own row" on public.admins;
create policy "admin reads own row" on public.admins for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies on admins: admins are added only from the SQL editor.

drop policy if exists "anyone reads categories" on public.categories;
create policy "anyone reads categories" on public.categories for select to anon, authenticated using (true);
drop policy if exists "admins insert categories" on public.categories;
create policy "admins insert categories" on public.categories for insert to authenticated with check (public.is_admin());
drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories" on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete categories" on public.categories;
create policy "admins delete categories" on public.categories for delete to authenticated using (public.is_admin());

drop policy if exists "public reads published products" on public.products;
create policy "public reads published products" on public.products for select to anon, authenticated using (is_published = true);
drop policy if exists "admins read all products" on public.products;
create policy "admins read all products" on public.products for select to authenticated using (public.is_admin());
drop policy if exists "admins insert products" on public.products;
create policy "admins insert products" on public.products for insert to authenticated with check (public.is_admin());
drop policy if exists "admins update products" on public.products;
create policy "admins update products" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete products" on public.products;
create policy "admins delete products" on public.products for delete to authenticated using (public.is_admin());

-- Storage: public bucket (images are shown on the website); only admins may write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "admins read product images" on storage.objects;
create policy "admins read product images" on storage.objects for select to authenticated using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- AFTER creating your admin user in Authentication > Users, authorise them (replace the email):
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';

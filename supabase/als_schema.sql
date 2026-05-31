create extension if not exists pgcrypto;

create or replace function public.als_generate_booking_id()
returns text
language sql
volatile
as $$
  select 'APT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
$$;

create or replace function public.als_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.als_appointments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null unique default public.als_generate_booking_id(),
  full_name text not null,
  phone text not null,
  test_name text not null,
  appointment_date date not null,
  time_slot text not null,
  collection_type text not null check (collection_type in ('Lab Visit', 'Home Collection')),
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Cancelled', 'In Progress')),
  source text not null default 'website',
  booked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint als_appointments_phone_check check (char_length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15)
);

create index if not exists als_appointments_booking_id_idx on public.als_appointments (booking_id);
create index if not exists als_appointments_phone_idx on public.als_appointments (phone);
create index if not exists als_appointments_date_idx on public.als_appointments (appointment_date);
create index if not exists als_appointments_status_idx on public.als_appointments (status);
create index if not exists als_appointments_test_name_idx on public.als_appointments (test_name);

drop trigger if exists als_appointments_touch_updated_at on public.als_appointments;
create trigger als_appointments_touch_updated_at
before update on public.als_appointments
for each row execute function public.als_touch_updated_at();

create table if not exists public.als_reports (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.als_appointments(id) on delete cascade,
  booking_id text not null unique,
  file_name text not null,
  mime_type text not null,
  storage_bucket text not null default 'als-reports',
  storage_path text not null,
  public_url text,
  doctor_note text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists als_reports_appointment_id_idx on public.als_reports (appointment_id);
create index if not exists als_reports_booking_id_idx on public.als_reports (booking_id);

drop trigger if exists als_reports_touch_updated_at on public.als_reports;
create trigger als_reports_touch_updated_at
before update on public.als_reports
for each row execute function public.als_touch_updated_at();

create table if not exists public.als_staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('doctor', 'admin', 'assistant')),
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists als_staff_profiles_touch_updated_at on public.als_staff_profiles;
create trigger als_staff_profiles_touch_updated_at
before update on public.als_staff_profiles
for each row execute function public.als_touch_updated_at();

create table if not exists public.als_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.als_appointments enable row level security;
alter table public.als_reports enable row level security;
alter table public.als_staff_profiles enable row level security;
alter table public.als_audit_logs enable row level security;

create or replace function public.als_is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.als_staff_profiles sp
    where sp.id = auth.uid()
      and sp.is_active = true
      and sp.role in ('doctor', 'admin', 'assistant')
  );
$$;

drop policy if exists "ALS staff can read appointments" on public.als_appointments;
create policy "ALS staff can read appointments"
on public.als_appointments
for select
using (public.als_is_active_staff());

drop policy if exists "ALS staff can manage appointments" on public.als_appointments;
create policy "ALS staff can manage appointments"
on public.als_appointments
for all
using (public.als_is_active_staff())
with check (public.als_is_active_staff());

drop policy if exists "ALS staff can read reports" on public.als_reports;
create policy "ALS staff can read reports"
on public.als_reports
for select
using (public.als_is_active_staff());

drop policy if exists "ALS staff can manage reports" on public.als_reports;
create policy "ALS staff can manage reports"
on public.als_reports
for all
using (public.als_is_active_staff())
with check (public.als_is_active_staff());

drop policy if exists "ALS staff can read staff profiles" on public.als_staff_profiles;
create policy "ALS staff can read staff profiles"
on public.als_staff_profiles
for select
using (public.als_is_active_staff() or auth.uid() = id);

drop policy if exists "ALS staff can manage audit logs" on public.als_audit_logs;
create policy "ALS staff can manage audit logs"
on public.als_audit_logs
for all
using (public.als_is_active_staff())
with check (public.als_is_active_staff());

drop policy if exists "ALS public can create appointments" on public.als_appointments;
create policy "ALS public can create appointments"
on public.als_appointments
for insert
to anon, authenticated
with check (true);

create or replace function public.als_customer_lookup(p_booking_id text, p_phone text)
returns table (
  id uuid,
  booking_id text,
  full_name text,
  phone text,
  test_name text,
  appointment_date date,
  time_slot text,
  collection_type text,
  status text,
  booked_at timestamptz,
  updated_at timestamptz,
  report jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.booking_id,
    a.full_name,
    a.phone,
    a.test_name,
    a.appointment_date,
    a.time_slot,
    a.collection_type,
    a.status,
    a.booked_at,
    a.updated_at,
    case
      when r.id is null then null
      else jsonb_build_object(
        'id', r.id,
        'fileName', r.file_name,
        'mimeType', r.mime_type,
        'storageBucket', r.storage_bucket,
        'storagePath', r.storage_path,
        'publicUrl', r.public_url,
        'note', r.doctor_note,
        'uploadedAt', r.uploaded_at,
        'updatedAt', r.updated_at,
        'uploadedBy', r.uploaded_by
      )
    end as report
  from public.als_appointments a
  left join lateral (
    select *
    from public.als_reports r2
    where r2.booking_id = a.booking_id
    order by r2.uploaded_at desc
    limit 1
  ) r on true
  where a.booking_id = p_booking_id
    and a.phone = p_phone
  limit 1;
$$;

grant execute on function public.als_customer_lookup(text, text) to anon, authenticated;

drop policy if exists "ALS staff can upload report objects" on storage.objects;
create policy "ALS staff can upload report objects"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'als-reports' and public.als_is_active_staff());

drop policy if exists "ALS staff can update report objects" on storage.objects;
create policy "ALS staff can update report objects"
on storage.objects
for update
to authenticated
using (bucket_id = 'als-reports' and public.als_is_active_staff())
with check (bucket_id = 'als-reports' and public.als_is_active_staff());

-- Kemas kini #3 (20/11/2026): rekod bacaan Iqra'/al-Quran ikut muka surat, dan hafazan ikut surah.
-- Jalankan SEKALI dalam Supabase > SQL Editor (query baru yang kosong). Selamat dijalankan semula.
alter table public.penilaian_quran add column if not exists hafazan_surah text[] not null default '{}';

create table if not exists public.bacaan_log (
  id           uuid primary key default gen_random_uuid(),
  murid_id     uuid not null references public.murid(id) on delete cascade,
  tarikh       date not null default current_date,
  jenis        text not null check (jenis in ('iqra','quran')),
  jilid        smallint check (jilid between 1 and 6),
  muka_surat   smallint not null check (muka_surat between 1 and 604),
  catatan      text check (length(catatan) <= 300),
  direkod_oleh uuid references public.guru(id),
  created_at   timestamptz not null default now(),
  check ((jenis = 'iqra' and jilid is not null) or (jenis = 'quran' and jilid is null))
);
create index if not exists bacaan_log_murid on public.bacaan_log (murid_id, created_at desc);
alter table public.bacaan_log enable row level security;
drop policy if exists bacaan_akses on public.bacaan_log;
create policy bacaan_akses on public.bacaan_log for all to authenticated
  using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));
grant select, insert, update, delete on public.bacaan_log to authenticated;

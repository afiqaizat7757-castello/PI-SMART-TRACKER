-- Kemas kini #1 (20/11/2026): sejarah markah untuk graf perkembangan murid.
-- Jalankan SEKALI dalam Supabase > SQL Editor (query baru yang kosong).
create table if not exists public.markah_sejarah (
  murid_id   uuid not null references public.murid(id) on delete cascade,
  tarikh     date not null default current_date,
  solat      numeric(5,1),
  quran      numeric(5,1),
  tp         numeric(5,1),
  total      numeric(5,1),
  primary key (murid_id, tarikh)
);
alter table public.markah_sejarah enable row level security;
drop policy if exists sejarah_akses on public.markah_sejarah;
create policy sejarah_akses on public.markah_sejarah for all to authenticated
  using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));
grant select, insert, update, delete on public.markah_sejarah to authenticated;

-- Isi titik pertama graf dari markah sedia ada tak boleh dikira dalam SQL dengan mudah;
-- graf akan mula terisi secara automatik setiap kali guru simpan penilaian.

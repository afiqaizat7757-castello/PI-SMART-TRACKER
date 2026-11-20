-- Rekod Pendidikan Islam: schema + Row Level Security (RLS)
-- Jalankan sekali dalam Supabase > SQL Editor.
-- Prinsip: guru login guna Google (DELIMa). Hanya email yang didaftar dalam jadual `guru`
-- (whitelist) boleh baca/tulis apa-apa. Semua guru PAI berdaftar nampak semua kelas.
-- Ketua panitia sahaja boleh daftar/nyahaktif guru dan ubah senarai kelas.
-- Tiada IC, alamat atau nombor telefon murid disimpan (minimum data, PDPA).

-- ============ JADUAL ============
create table public.guru (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(email)),
  nama       text not null,
  peranan    text not null default 'guru' check (peranan in ('guru','ketua_panitia')),
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.kelas (
  id         uuid primary key default gen_random_uuid(),
  tingkatan  smallint not null check (tingkatan between 1 and 5),
  nama       text not null,                        -- UM, UPM, UKM, UTM, UIA, USM
  unique (tingkatan, nama)
);

create table public.murid (
  id         uuid primary key default gen_random_uuid(),
  kelas_id   uuid not null references public.kelas(id),
  nama       text not null check (length(nama) between 2 and 120),
  aktif      boolean not null default true,       -- false bila murid pindah/tamat
  created_at timestamptz not null default now()
);
create index on public.murid (kelas_id);

-- 13 rukun solat, satu baris setiap murid
create table public.penilaian_solat (
  murid_id   uuid primary key references public.murid(id) on delete cascade,
  rukun      boolean[] not null default array_fill(false, array[13]) check (cardinality(rukun) = 13),
  updated_by uuid references public.guru(id),
  updated_at timestamptz not null default now()
);

create table public.penilaian_quran (
  murid_id   uuid primary key references public.murid(id) on delete cascade,
  tajwid     smallint check (tajwid  between 1 and 5),
  makhraj    smallint check (makhraj between 1 and 5),
  kelancaran smallint check (kelancaran between 1 and 5),
  fasohah    smallint check (fasohah between 1 and 5),
  tahap      smallint check (tahap between 0 and 5),   -- 0 Iqra' 1-3 ... 5 Khatam
  hafazan    smallint check (hafazan between 0 and 114),
  updated_by uuid references public.guru(id),
  updated_at timestamptz not null default now()
);

create table public.penilaian_tp (
  murid_id   uuid not null references public.murid(id) on delete cascade,
  bidang     text not null,
  tp         smallint not null check (tp between 1 and 6),
  updated_by uuid references public.guru(id),
  updated_at timestamptz not null default now(),
  primary key (murid_id, bidang)
);

create table public.catatan_guru (
  murid_id   uuid primary key references public.murid(id) on delete cascade,
  catatan    text check (length(catatan) <= 2000),
  updated_by uuid references public.guru(id),
  updated_at timestamptz not null default now()
);

-- Kehadiran Yasin Jumaat: satu sesi setiap kelas setiap Jumaat, simpan yang TIDAK hadir sahaja
create table public.yasin_sesi (
  id         uuid primary key default gen_random_uuid(),
  kelas_id   uuid not null references public.kelas(id) on delete cascade,
  tarikh     date not null check (extract(isodow from tarikh) = 5),
  direkod_oleh uuid references public.guru(id),
  created_at timestamptz not null default now(),
  unique (kelas_id, tarikh)
);

create table public.yasin_tidak_hadir (
  sesi_id  uuid not null references public.yasin_sesi(id) on delete cascade,
  murid_id uuid not null references public.murid(id) on delete cascade,
  primary key (sesi_id, murid_id)
);

-- ============ FUNGSI BANTU (server-side, tak boleh dipalsukan dari browser) ============
create or replace function public.guru_semasa() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.guru
  where email = lower(auth.jwt() ->> 'email') and aktif
$$;

create or replace function public.is_ketua() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guru
    where email = lower(auth.jwt() ->> 'email') and aktif and peranan = 'ketua_panitia')
$$;

-- Semua guru berdaftar & aktif boleh akses semua kelas.
-- (Kalau satu hari nak hadkan ikut kelas, tukar fungsi ini sahaja.)
create or replace function public.boleh_akses_kelas(k uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.guru_semasa() is not null
$$;

create or replace function public.boleh_akses_murid(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.murid where id = m and public.boleh_akses_kelas(kelas_id))
$$;

-- ============ RLS ============
alter table public.guru              enable row level security;
alter table public.kelas             enable row level security;
alter table public.murid             enable row level security;
alter table public.penilaian_solat   enable row level security;
alter table public.penilaian_quran   enable row level security;
alter table public.penilaian_tp      enable row level security;
alter table public.catatan_guru      enable row level security;
alter table public.yasin_sesi        enable row level security;
alter table public.yasin_tidak_hadir enable row level security;

-- guru: nampak diri sendiri; ketua urus semua
create policy guru_baca  on public.guru for select to authenticated using (id = public.guru_semasa() or public.is_ketua());
create policy guru_urus  on public.guru for all    to authenticated using (public.is_ketua()) with check (public.is_ketua());

-- kelas: guru berdaftar boleh baca; ketua sahaja ubah
create policy kelas_baca on public.kelas for select to authenticated using (public.guru_semasa() is not null);
create policy kelas_urus on public.kelas for all    to authenticated using (public.is_ketua()) with check (public.is_ketua());

-- murid: ikut kelas guru
create policy murid_akses on public.murid for all to authenticated
  using (public.boleh_akses_kelas(kelas_id)) with check (public.boleh_akses_kelas(kelas_id));

-- penilaian & catatan: ikut murid yang guru boleh akses
create policy solat_akses   on public.penilaian_solat for all to authenticated using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));
create policy quran_akses   on public.penilaian_quran for all to authenticated using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));
create policy tp_akses      on public.penilaian_tp    for all to authenticated using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));
create policy catatan_akses on public.catatan_guru    for all to authenticated using (public.boleh_akses_murid(murid_id)) with check (public.boleh_akses_murid(murid_id));

-- Yasin
create policy ysesi_akses on public.yasin_sesi for all to authenticated
  using (public.boleh_akses_kelas(kelas_id)) with check (public.boleh_akses_kelas(kelas_id));
create policy yth_akses on public.yasin_tidak_hadir for all to authenticated
  using (exists (select 1 from public.yasin_sesi s where s.id = sesi_id and public.boleh_akses_kelas(s.kelas_id)))
  with check (public.boleh_akses_murid(murid_id)
          and exists (select 1 from public.yasin_sesi s where s.id = sesi_id and public.boleh_akses_kelas(s.kelas_id)));

-- ============ SEJARAH MARKAH (graf) ============
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


-- ============ GRANT (projek Supabase baharu mungkin tak beri akses jadual secara automatik) ============
-- Selamat: RLS di atas masih menapis setiap baris.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ============ DATA AWAL ============
insert into public.kelas (tingkatan, nama)
select t, n from generate_series(1,5) t,
  unnest(array['UM','UPM','UKM','UTM','UIA']) n
union all
select t, 'USM' from generate_series(4,5) t;

-- Daftar ketua panitia pertama (tukar email & nama sebelum run):
-- insert into public.guru (email, nama, peranan) values ('emel.anda@moe-dl.edu.my', 'Nama Anda', 'ketua_panitia');

-- Kemas kini #2 (20/11/2026): fungsi ping supaya projek Supabase percuma tak "pause" masa cuti.
-- GitHub Actions panggil fungsi ini setiap 3 hari. Ia tak baca atau dedahkan apa-apa data murid.
create or replace function public.ping() returns text
language sql stable as $$ select 'ok ' || now()::text $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

# Rekod Pendidikan Islam

App guru Pendidikan Islam untuk rekod amali solat (13 rukun), tilawah al-Quran, kehadiran Yasin Jumaat, TP ikut bidang, kelebihan/kelemahan murid dan ranking kelas.

Stack: HTML/CSS/JS biasa + Supabase (database + login Google). Hosting: GitHub Pages.

## Akses
- Hanya email yang didaftar dalam jadual `guru` boleh masuk (whitelist).
- Semua guru PAI berdaftar nampak semua 27 kelas.
- Ketua panitia boleh daftar dan nyahaktif guru (tab Urus).
- Semua had akses dikawal oleh RLS dalam database, bukan dalam browser.

## Setup (sekali sahaja)
1. **Supabase**: buat projek baru, region Singapore (projek sebenar: Tokyo, ap-northeast-1, ok juga).
2. **SQL Editor**: paste `supabase/schema.sql`. Tukar baris terakhir kepada email dan nama ketua panitia, buang `--` di depannya, kemudian Run.
3. **Login Google**: Authentication > Sign In / Providers > Google. Perlu Client ID dan Secret dari Google Cloud Console (OAuth client jenis Web). Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
4. **URL Configuration**: Authentication > URL Configuration. Site URL dan Redirect URLs = alamat GitHub Pages, iaitu `https://afiqaizat7757-castello.github.io/PI-SMART-TRACKER/`.
5. **config.js**: isi `url` dan `anonKey` (Settings > API). Jangan sesekali letak `service_role` key.
6. **GitHub Pages**: fail app ada di root repo; Pages serve dari branch `main`, folder `/`. Alamat: https://afiqaizat7757-castello.github.io/PI-SMART-TRACKER/

## PDPA
- Simpan nama murid sahaja. Tiada IC, alamat atau nombor telefon.
- Murid yang pindah atau tamat ditanda tidak aktif (tab Urus). Cadangan: padam rekod murid yang tamat sekolah lebih 1 tahun.
- Jangan export data ke Google Sheet awam atau kongsi link Supabase dashboard.

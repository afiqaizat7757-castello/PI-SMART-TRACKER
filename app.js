"use strict";
// Rekod Pendidikan Islam: frontend vanilla JS + Supabase.
// Semua kawalan akses sebenar berlaku dalam RLS (schema.sql). Semakan peranan di sini untuk UI sahaja.

const sb = supabase.createClient(window.REKOD_CONFIG.url, window.REKOD_CONFIG.anonKey);

const RUKUN = ["Niat","Berdiri betul (qiyam)","Takbiratul ihram","Membaca al-Fatihah","Rukuk dengan tomakninah","Iktidal dengan tomakninah","Sujud dua kali dengan tomakninah","Duduk antara dua sujud","Duduk tahiyat akhir","Membaca tahiyat akhir","Selawat ke atas Nabi","Memberi salam pertama","Tertib"];
const BIDANG = ["Tilawah al-Quran","Hafazan","Akidah","Ibadah","Sirah","Adab & akhlak","Jawi"];
const QRUB = [["tajwid","Tajwid"],["makhraj","Makhraj huruf"],["kelancaran","Kelancaran"],["fasohah","Fasohah"]];
const TAHAP = ["Iqra' 1-3","Iqra' 4-6","Al-Quran Juz 1-10","Al-Quran Juz 11-20","Al-Quran Juz 21-30","Khatam"];
const SUSUNAN_KELAS = ["UM","UPM","UKM","UTM","UIA","USM"];
// Wajaran markah keseluruhan
const W = { solat: 0.3, quran: 0.3, tp: 0.4 };

const state = { me: null, kelasList: [], allKelas: [], kelas: null, tab: "ranking", sid: null, murid: [], yasin: {}, ydate: null, adminGuru: null, guruList: [], solatMode: "satu", sejarah: {} };

// ---------- util ----------
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [a, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (a === "class") e.className = v;
    else if (a.startsWith("on")) e.addEventListener(a.slice(2), v);
    else e.setAttribute(a, v);
  }
  for (const c of kids.flat()) { if (c == null) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e; // teks sentiasa masuk sebagai text node, bukan innerHTML (elak XSS)
};
let tTimer;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tTimer); tTimer = setTimeout(() => t.hidden = true, 1800); }
function gagal(err) { console.error(err); toast("Gagal simpan: " + (err?.message || "ralat tidak diketahui")); }
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dmy = s => s.split("-").reverse().join("/");
function lastFridays(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7)); const out = []; for (let i = 0; i < n; i++) { const x = new Date(d); x.setDate(d.getDate() - 7 * i); out.push(iso(x)); } return out; }
function nextFriday() { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return iso(d); }
const KECIL = new Set(["bin","binti","bt","b.","a/l","a/p","al","bte"]);
const titleCase = s => s.toLowerCase().split(/\s+/).map((w, i) => i && KECIL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
function avatar(nama, lg) {
  const w = nama.split(/\s+/).filter(x => !KECIL.has(x.toLowerCase()) && !/^(muhammad|mohd|muhd|mohamad|mohammad|nur|nor|nurul|siti|ahmad)$/i.test(x));
  const ini = ((w[0] || nama)[0] + (w[1] ? w[1][0] : "")).toUpperCase();
  let h = 0; for (const ch of nama) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return el("span", { class: "av" + (lg ? " lg" : ""), style: "background:hsl(" + h + " 45% 42%)", "aria-hidden": "true" }, ini);
}
const pendek = n => n.split(/\s+/).filter(x => !KECIL.has(x.toLowerCase())).slice(0, 2).join(" ");
const kelasLabel = k => k.tingkatan + " " + k.nama;
const stamp = () => ({ updated_by: state.me.id, updated_at: new Date().toISOString() });
const isKetua = () => state.me?.peranan === "ketua_panitia";

// ---------- auth ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  const email = (session.user.email || "").toLowerCase();
  const { data: me, error } = await sb.from("guru").select("*").eq("email", email).eq("aktif", true).maybeSingle();
  if (error) return showError("Tak dapat baca senarai guru: " + error.message + (error.code ? " (" + error.code + ")" : ""));
  if (!me) return showNotRegistered(email);
  state.me = me;
  renderTop();
  const { data: kelas, error: ek } = await sb.from("kelas").select("*");
  if (ek) return gagal(ek);
  kelas.sort((a, b) => a.tingkatan - b.tingkatan || SUSUNAN_KELAS.indexOf(a.nama) - SUSUNAN_KELAS.indexOf(b.nama));
  state.allKelas = kelas;
  const list = kelas; // semua guru PAI berdaftar nampak semua kelas
  state.kelasList = list;
  if (!list.length) { state.tab = "urus"; return render(); }
  await pilihKelas(list[0].id);
}

function showLogin() {
  $("#topright").replaceChildren();
  $("#app").replaceChildren(el("div", { class: "login card" },
    el("strong", {}, "Log masuk guru"),
    el("p", { class: "hint" }, "Guna akaun Google (DELIMa atau Gmail) yang didaftarkan. Hanya guru yang didaftarkan oleh ketua panitia boleh masuk."),
    el("button", { class: "btn", onclick: () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } } }) }, "Log masuk dengan Google")));
}
function showNotRegistered(email) {
  $("#topright").replaceChildren(el("button", { class: "linkbtn", onclick: logout }, "Log keluar"));
  $("#app").replaceChildren(el("div", { class: "login card" },
    el("strong", {}, "Akaun belum didaftarkan"),
    el("p", { class: "hint" }, "Email " + email + " belum ada dalam senarai guru. Minta ketua panitia Pendidikan Islam daftarkan email ini, kemudian log masuk semula.")));
}
function showError(msg) {
  $("#topright").replaceChildren(el("button", { class: "linkbtn", onclick: logout }, "Log keluar"));
  $("#app").replaceChildren(el("div", { class: "login card" }, el("strong", {}, "Ralat sambungan database"), el("p", { class: "hint" }, msg)));
}
async function logout() { await sb.auth.signOut(); location.reload(); }

function renderTop() {
  const ks = el("select", { id: "kelas", "aria-label": "Pilih kelas", onchange: e => pilihKelas(e.target.value) });
  const groups = {};
  for (const k of state.kelasList) (groups[k.tingkatan] ||= []).push(k);
  for (const [t, ks2] of Object.entries(groups)) ks.append(el("optgroup", { label: "Tingkatan " + t }, ks2.map(k => { const o = el("option", { value: k.id }, kelasLabel(k)); if (k.id === state.kelas) o.selected = true; return o; })));
  $("#topright").replaceChildren(el("div", { class: "field" },
    el("div", { class: "who" }, el("span", {}, state.me.nama + (isKetua() ? " · Ketua panitia" : "")), el("button", { class: "linkbtn", onclick: logout }, "Log keluar")),
    state.kelasList.length ? ks : null));
}

// ---------- data ----------
// Ambil semua data satu kelas (tanpa ubah state) - dipakai oleh paparan dan export
async function ambilKelas(kid) {
  const { data: m, error } = await sb.from("murid").select("id,nama").eq("kelas_id", kid).eq("aktif", true).order("nama");
  if (error) throw error;
  const ids = m.map(x => x.id);
  let S = [], Q = [], T = [], C = [];
  if (ids.length) {
    const r = await Promise.all([
      sb.from("penilaian_solat").select("*").in("murid_id", ids),
      sb.from("penilaian_quran").select("*").in("murid_id", ids),
      sb.from("penilaian_tp").select("*").in("murid_id", ids),
      sb.from("catatan_guru").select("*").in("murid_id", ids),
    ]);
    const bad = r.find(x => x.error); if (bad) throw bad.error;
    [S, Q, T, C] = r.map(x => x.data);
  }
  const by = (arr, id) => arr.find(x => x.murid_id === id);
  const murid = m.map(x => {
    const s = by(S, x.id), q = by(Q, x.id) || {}, c = by(C, x.id);
    return {
      id: x.id, nama: titleCase(x.nama),
      solat: s?.rukun ? [...s.rukun] : Array(13).fill(false),
      quran: { tajwid: q.tajwid ?? null, makhraj: q.makhraj ?? null, kelancaran: q.kelancaran ?? null, fasohah: q.fasohah ?? null, tahap: q.tahap ?? null, hafazan: q.hafazan ?? null },
      tp: BIDANG.map(b => T.find(t => t.murid_id === x.id && t.bidang === b)?.tp ?? null),
      catatan: c?.catatan || "",
    };
  });
  const { data: ses, error: ey } = await sb.from("yasin_sesi").select("id,tarikh,yasin_tidak_hadir(murid_id)").eq("kelas_id", kid);
  if (ey) throw ey;
  const yasin = {};
  for (const s of ses) yasin[s.tarikh] = { id: s.id, absent: s.yasin_tidak_hadir.map(a => a.murid_id) };
  return { murid, yasin };
}
async function pilihKelas(kid) {
  state.kelas = kid; state.sid = null;
  $("#app").replaceChildren(el("p", { class: "hint" }, "Memuatkan kelas..."));
  try { const d = await ambilKelas(kid); state.murid = d.murid; state.yasin = d.yasin; }
  catch (e) { return gagal(e); }
  renderTop(); render();
}

// ---------- export CSV (buka terus dalam Excel) ----------
function selCSV(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;           // elak formula injection bila dibuka dalam Excel
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function barisExport(k, d) {
  const simpan = { murid: state.murid, yasin: state.yasin };
  state.murid = d.murid; state.yasin = d.yasin;   // lencana & yasinStat baca dari state
  try {
    const n1 = nombor1Id();
    return d.murid.map(s => {
      const sc = scores(s), y = yasinStat(s);
      return [k.tingkatan, k.nama, s.nama, s.solat.filter(Boolean).length, r1(sc.solat),
        s.quran.tajwid, s.quran.makhraj, s.quran.kelancaran, s.quran.fasohah, s.quran.tahap == null ? "" : TAHAP[s.quran.tahap], s.quran.hafazan, r1(sc.quran),
        ...s.tp.map(v => v == null ? "" : "TP" + v), r1(sc.tp), y.sesi ? y.hadir + "/" + y.sesi : "", r1(y.pct), r1(sc.total),
        lencana(s, { nombor1: n1 === s.id }).filter(b => b.dapat).map(b => b.nama).join("; "), s.catatan];
    });
  } finally { state.murid = simpan.murid; state.yasin = simpan.yasin; }
}
const KEPALA = ["Tingkatan", "Kelas", "Nama murid", "Rukun solat dikuasai (/13)", "Amali solat %", "Tajwid", "Makhraj", "Kelancaran", "Fasohah", "Tahap bacaan", "Surah hafazan", "Al-Quran %",
  ...BIDANG.map(b => "TP " + b), "Purata TP %", "Hadir Yasin", "Yasin %", "Markah keseluruhan", "Lencana", "Catatan guru"];
function muatTurun(nama, rows) {
  const csv = "\uFEFF" + [KEPALA, ...rows].map(r => r.map(selCSV).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: nama }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportKelas(semua, btn) {
  const asal = btn.textContent; btn.disabled = true;
  try {
    const senarai = semua ? state.kelasList : state.kelasList.filter(k => k.id === state.kelas);
    const rows = [];
    for (const [i, k] of senarai.entries()) {
      btn.textContent = semua ? "Mengumpul " + (i + 1) + "/" + senarai.length + "..." : "Menyediakan...";
      const d = k.id === state.kelas ? { murid: state.murid, yasin: state.yasin } : await ambilKelas(k.id);
      rows.push(...barisExport(k, d));
    }
    if (!rows.length) return toast("Tiada murid untuk diexport");
    const hari = iso(new Date());
    const k0 = senarai[0];
    muatTurun(semua ? "Rekod-PI-semua-kelas-" + hari + ".csv" : "Rekod-PI-" + k0.tingkatan + "-" + k0.nama + "-" + hari + ".csv", rows);
    toast(rows.length + " murid diexport");
  } catch (e) { gagal(e); }
  finally { btn.disabled = false; btn.textContent = asal; }
}

const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
function scores(s) {
  const solat = s.solat.filter(Boolean).length / RUKUN.length * 100;
  const qa = avg(QRUB.map(([k]) => s.quran[k])); const quran = qa == null ? null : qa / 5 * 100;
  const ta = avg(s.tp); const tp = ta == null ? null : ta / 6 * 100;
  // Komponen yang belum dinilai tak dikira; wajaran dinormalkan semula
  let tot = 0, w = 0;
  for (const [k, v] of [["solat", solat], ["quran", quran], ["tp", tp]]) if (v != null) { tot += v * W[k]; w += W[k]; }
  const dinilai = s.solat.some(Boolean) || quran != null || tp != null;
  return { solat, quran, tp, tpAvg: ta, total: dinilai && w ? tot / w : null };
}
const band = v => v == null ? ["mid", "Belum dinilai"] : v >= 75 ? ["ok", "Cemerlang"] : v >= 50 ? ["mid", "Sederhana"] : ["low", "Perlu bimbingan"];
function yasinStat(s) { const ds = Object.keys(state.yasin); const hadir = ds.filter(d => !state.yasin[d].absent.includes(s.id)).length; return { sesi: ds.length, hadir, pct: ds.length ? hadir / ds.length * 100 : null }; }
const current = () => state.murid.find(s => s.id === state.sid) || state.murid[0];
const pct = v => v == null ? "-" : Math.round(v) + "%";

// ---------- simpan ----------
async function simpanSolat(s) { const { error } = await sb.from("penilaian_solat").upsert({ murid_id: s.id, rukun: s.solat, ...stamp() }); error ? gagal(error) : (toast("Disimpan"), rekodSejarah(s)); }
async function simpanQuran(s) { const { error } = await sb.from("penilaian_quran").upsert({ murid_id: s.id, ...s.quran, ...stamp() }); error ? gagal(error) : (toast("Disimpan"), rekodSejarah(s)); }
async function simpanTP(s, i) { const { error } = await sb.from("penilaian_tp").upsert({ murid_id: s.id, bidang: BIDANG[i], tp: s.tp[i], ...stamp() }); error ? gagal(error) : (toast("Disimpan"), rekodSejarah(s)); }
// Gambaran markah sehari sekali (baris terakhir hari itu menang) untuk graf perkembangan
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
async function rekodSejarah(s) {
  const sc = scores(s); if (sc.total == null) return;
  const row = { murid_id: s.id, tarikh: iso(new Date()), solat: r1(sc.solat), quran: r1(sc.quran), tp: r1(sc.tp), total: r1(sc.total) };
  const { error } = await sb.from("markah_sejarah").upsert(row);
  if (error) { console.warn("markah_sejarah:", error.message); return; }
  const h = state.sejarah[s.id]; if (h) { const i = h.findIndex(x => x.tarikh === row.tarikh); if (i >= 0) h[i] = row; else h.push(row); }
}
async function muatSejarah(id) {
  state.sejarah[id] = "loading";
  const { data, error } = await sb.from("markah_sejarah").select("tarikh,solat,quran,tp,total").eq("murid_id", id).order("tarikh");
  state.sejarah[id] = error ? { ralat: error.message } : data;
  if (state.tab === "profil" && current()?.id === id) render();
}

// ---------- ikon & lencana ----------
const IKON = {
  check: "M5 12.5l4.5 4.5L19 7.5", mic: "M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4M9 21h6",
  book: "M4 19.5V5a2 2 0 012-2h14v15H6a2 2 0 00-2 2 2 2 0 002 2h14", moon: "M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z",
  star: "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z",
  trophy: "M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a4 4 0 004 4M17 6h3v1a4 4 0 01-4 4M12 13v4M8 21h8M10 17h4",
  khatam: "M12 3l2 4 4 .5-3 3 .8 4.5-3.8-2-3.8 2 .8-4.5-3-3 4-.5zM6 21h12",
};
function ikon(n, size) {
  const NS = "http://www.w3.org/2000/svg", sv = document.createElementNS(NS, "svg");
  sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("width", size || 18); sv.setAttribute("height", size || 18); sv.setAttribute("aria-hidden", "true");
  const pa = document.createElementNS(NS, "path"); pa.setAttribute("d", IKON[n]); pa.setAttribute("fill", "none"); pa.setAttribute("stroke", "currentColor");
  pa.setAttribute("stroke-width", "2"); pa.setAttribute("stroke-linecap", "round"); pa.setAttribute("stroke-linejoin", "round"); sv.append(pa); return sv;
}
function yasinStreak(s) { let n = 0; for (const d of Object.keys(state.yasin).sort().reverse()) { if (state.yasin[d].absent.includes(s.id)) break; n++; } return n; }
function lencana(s, ctx = {}) {
  const q = s.quran, st = yasinStreak(s);
  return [
    { k: "solat", ikon: "check", nama: "Solat Sempurna", syarat: "Kuasai semua 13 rukun solat", dapat: s.solat.every(Boolean) },
    { k: "qari", ikon: "mic", nama: "Bacaan Mantap", syarat: "Tajwid, makhraj, kelancaran dan fasohah 4 ke atas", dapat: QRUB.every(([k]) => (q[k] ?? 0) >= 4) },
    { k: "juzamma", ikon: "book", nama: "Hafiz Juz Amma", syarat: "Hafaz 37 surah (Juz Amma)", dapat: (q.hafazan ?? 0) >= 37 },
    { k: "khatam", ikon: "khatam", nama: "Khatam al-Quran", syarat: "Tahap bacaan: Khatam", dapat: q.tahap === 5 },
    { k: "yasin", ikon: "moon", nama: "Istiqamah Yasin", syarat: "Hadir Yasin 8 Jumaat berturut-turut (sekarang " + st + ")", dapat: st >= 8 },
    { k: "tp", ikon: "star", nama: "TP Cemerlang", syarat: "TP5 ke atas dalam semua 7 bidang", dapat: s.tp.every(v => (v ?? 0) >= 5) },
    { k: "bintang", ikon: "trophy", nama: "Bintang Kelas", syarat: "Nombor 1 dalam ranking kelas", dapat: !!ctx.nombor1 },
  ];
}
function nombor1Id() { let best = null, bv = -1; for (const s of state.murid) { const t = scores(s).total; if (t != null && t > bv) { bv = t; best = s.id; } } return best; }
async function simpanCatatan(s) { const { error } = await sb.from("catatan_guru").upsert({ murid_id: s.id, catatan: s.catatan.slice(0, 2000), ...stamp() }); error ? gagal(error) : toast("Disimpan"); }
async function pastikanSesi(tarikh) {
  if (state.yasin[tarikh]) return state.yasin[tarikh];
  const { data, error } = await sb.from("yasin_sesi").insert({ kelas_id: state.kelas, tarikh, direkod_oleh: state.me.id }).select("id").single();
  if (error) { gagal(error); return null; }
  return (state.yasin[tarikh] = { id: data.id, absent: [] });
}
async function toggleHadir(tarikh, mid) {
  const ses = await pastikanSesi(tarikh); if (!ses) return;
  const out = ses.absent.includes(mid);
  const { error } = out
    ? await sb.from("yasin_tidak_hadir").delete().eq("sesi_id", ses.id).eq("murid_id", mid)
    : await sb.from("yasin_tidak_hadir").insert({ sesi_id: ses.id, murid_id: mid });
  if (error) return gagal(error);
  ses.absent = out ? ses.absent.filter(x => x !== mid) : [...ses.absent, mid];
  toast("Kehadiran disimpan"); render();
}

// ---------- paparan ----------
function studentPicker() {
  const list = state.murid; const cur = current(); const idx = list.indexOf(cur);
  const go = d => { state.sid = list[(idx + d + list.length) % list.length].id; render(); };
  return el("div", { class: "picker" }, el("span", { class: "lbl" }, "Murid"),
    el("select", { id: "murid", "aria-label": "Pilih murid", onchange: e => { state.sid = e.target.value; render(); } },
      list.map(s => { const o = el("option", { value: s.id }, s.nama); if (s.id === cur.id) o.selected = true; return o; })),
    el("button", { class: "linkbtn", onclick: () => go(-1) }, "‹ Sebelum"),
    el("button", { class: "linkbtn", onclick: () => go(1) }, "Seterusnya ›"));
}
const kosong = () => el("div", { class: "empty" }, "Belum ada murid dalam kelas ini. Tambah murid di tab Urus.");

// Mod laju: semua murid dalam satu jadual. Tak render semula seluruh skrin supaya scroll tak lari.
function solatKelas() {
  const kira = s => s.solat.filter(Boolean).length + "/13";
  const rows = state.murid.map(s => {
    const cnt = el("td", { class: "num cnt" }, kira(s));
    const tr = el("tr", {}, el("th", { scope: "row", class: "sticky" }, el("span", { class: "nm" }, avatar(s.nama), el("span", {}, pendek(s.nama)))));
    const boxes = RUKUN.map((r, i) => {
      const inp = el("input", { type: "checkbox", "aria-label": s.nama + ": " + r, onchange: e => { s.solat[i] = e.target.checked; cnt.textContent = kira(s); tr.classList.toggle("full", s.solat.every(Boolean)); simpanSolat(s); } });
      inp.checked = s.solat[i]; tr.append(el("td", { class: "cb" }, inp)); return inp;
    });
    tr.append(cnt, el("td", {}, el("button", { class: "linkbtn sm", onclick: () => { const all = !s.solat.every(Boolean); s.solat = s.solat.map(() => all); boxes.forEach(b => b.checked = all); cnt.textContent = kira(s); tr.classList.toggle("full", all); simpanSolat(s); } }, "Semua")));
    if (s.solat.every(Boolean)) tr.classList.add("full");
    return tr;
  });
  return el("div", { class: "card" },
    el("p", { class: "hint" }, "Tanda terus rukun yang murid lakukan dengan betul. Setiap tanda disimpan serta-merta. Nombor lajur ikut senarai 13 rukun di bawah jadual."),
    el("div", { class: "tblwrap solatgrid" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", { class: "sticky" }, "Murid"), RUKUN.map((r, i) => el("th", { class: "cb", title: r }, String(i + 1))), el("th", { class: "num" }, "Jumlah"), el("th", {}, ""))),
      el("tbody", {}, rows))),
    el("details", { class: "legend" }, el("summary", {}, "Senarai 13 rukun"), el("ol", {}, RUKUN.map(r => el("li", {}, r)))));
}

const views = {
  ranking() {
    if (!state.murid.length) return [kosong()];
    const list = state.murid.map(s => ({ s, sc: scores(s), y: yasinStat(s) })).sort((a, b) => (b.sc.total ?? -1) - (a.sc.total ?? -1));
    const dinilai = list.filter(x => x.sc.total != null);
    return [
      el("div", { class: "summary" },
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Purata kelas"), el("b", {}, dinilai.length ? (dinilai.reduce((a, x) => a + x.sc.total, 0) / dinilai.length).toFixed(1) + "%" : "-")),
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Lulus 13 rukun solat"), el("b", {}, list.filter(x => x.sc.solat === 100).length + " / " + list.length)),
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Perlu bimbingan"), el("b", {}, String(dinilai.filter(x => x.sc.total < 50).length)))),
      dinilai.length >= 3 ? el("div", { class: "podium" }, [1, 0, 2].map(i => { const x = list[i];
        return el("button", { class: "pod p" + (i + 1), onclick: () => { state.sid = x.s.id; setTab("profil"); } },
          el("span", { class: "medal" }, String(i + 1)), avatar(x.s.nama, i === 0), el("span", { class: "pn" }, pendek(x.s.nama)), el("span", { class: "ps" }, x.sc.total.toFixed(1))); })) : null,
      el("p", { class: "hint" }, "Markah keseluruhan = Amali solat 30% + Al-Quran 30% + purata TP 40%. Bahagian yang belum dinilai tidak dikira. Tekan nama untuk buka profil."),
      el("div", { class: "rank" }, list.map((x, i) => {
        const [c, t] = band(x.sc.total);
        return el("button", { class: "row", onclick: () => { state.sid = x.s.id; setTab("profil"); } },
          el("span", { class: "pos" + (i < 3 && x.sc.total != null ? " top" : "") }, String(i + 1)),
          avatar(x.s.nama),
          el("span", { style: "min-width:0" }, el("div", { class: "name" }, x.s.nama),
            el("div", { class: "bars" }, el("span", { class: "pill " + c }, t),
              el("span", {}, "Solat " + pct(x.sc.solat)), el("span", {}, "Quran " + pct(x.sc.quran)), el("span", {}, "TP " + pct(x.sc.tp)),
              x.y.pct == null ? null : el("span", {}, "Yasin " + pct(x.y.pct)),
              (() => { const L = lencana(x.s, { nombor1: i === 0 && x.sc.total != null }).filter(b => b.dapat); return L.length ? el("span", { class: "minibadge", title: L.map(b => b.nama).join(", ") }, L.map(b => ikon(b.ikon, 14))) : null; })())),
          el("span", { class: "score" }, x.sc.total == null ? "-" : x.sc.total.toFixed(1), el("small", {}, "/ 100")));
      })),
    ];
  },
  solat() {
    if (!state.murid.length) return [kosong()];
    const mod = el("div", { class: "seg", role: "group", "aria-label": "Mod paparan" },
      [["satu", "Seorang murid"], ["kelas", "Satu kelas (laju)"]].map(([k, l]) => el("button", { "aria-pressed": String(state.solatMode === k), onclick: () => { state.solatMode = k; render(); } }, l)));
    if (state.solatMode === "kelas") return [mod, solatKelas()];
    const s = current(); const done = s.solat.filter(Boolean).length;
    return [mod, studentPicker(), el("div", { class: "card" },
      el("div", { style: "display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap" }, el("strong", {}, "13 rukun solat"), el("span", {}, done + " / 13 dikuasai")),
      el("div", { class: "meter" }, el("i", { style: "width:" + (done / 13 * 100) + "%" })),
      el("div", { class: "checks" }, RUKUN.map((r, i) => {
        const inp = el("input", { type: "checkbox", id: "r" + i, onchange: e => { s.solat[i] = e.target.checked; simpanSolat(s); render(); } }); inp.checked = s.solat[i];
        return el("label", { class: "chk" + (s.solat[i] ? " on" : ""), for: "r" + i }, inp, el("span", { class: "n" }, String(i + 1)), r);
      })),
      el("p", { class: "hint" }, "Tanda rukun yang murid lakukan dengan betul semasa amali."))];
  },
  quran() {
    if (!state.murid.length) return [kosong()];
    const s = current();
    const rub = QRUB.map(([k, label]) => el("div", { class: "field" }, el("span", { class: "lbl" }, label + " (1-5)"),
      el("div", { class: "scale" }, [1, 2, 3, 4, 5].map(n => el("button", { class: s.quran[k] === n ? "on" : "", "aria-pressed": String(s.quran[k] === n), "aria-label": label + " " + n, onclick: () => { s.quran[k] = n; simpanQuran(s); render(); } }, String(n))))));
    const tahap = el("select", { id: "tahap", onchange: e => { s.quran.tahap = e.target.value === "" ? null : +e.target.value; simpanQuran(s); } },
      el("option", { value: "" }, "Belum dinilai"), TAHAP.map((t, i) => { const o = el("option", { value: i }, t); if (i === s.quran.tahap) o.selected = true; return o; }));
    const haf = el("input", { type: "text", inputmode: "numeric", id: "hafazan", value: s.quran.hafazan ?? "", style: "width:90px", onchange: e => { const v = parseInt(e.target.value, 10); s.quran.hafazan = isNaN(v) ? null : Math.max(0, Math.min(114, v)); simpanQuran(s); render(); } });
    return [studentPicker(),
      el("div", { class: "card" }, el("strong", {}, "Penilaian tilawah"), el("div", { class: "grid2" }, rub), el("p", { class: "hint" }, "1 = sangat lemah, 3 = sederhana, 5 = sangat baik.")),
      el("div", { class: "card" }, el("strong", {}, "Kemajuan bacaan"), el("div", { class: "grid2" },
        el("div", { class: "field" }, el("span", { class: "lbl" }, "Tahap bacaan"), tahap),
        el("div", { class: "field" }, el("span", { class: "lbl" }, "Surah hafazan dikuasai"), haf)))];
  },
  yasin() {
    if (!state.murid.length) return [kosong()];
    const opts = [nextFriday(), ...lastFridays(8)].filter((v, i, a) => a.indexOf(v) === i);
    for (const d of Object.keys(state.yasin).sort().reverse()) if (!opts.includes(d)) opts.push(d);
    if (!opts.includes(state.ydate)) state.ydate = opts[0];
    const date = state.ydate; const rec = state.yasin[date]; const abs = rec?.absent || []; const list = state.murid;
    const sesi = Object.keys(state.yasin).length;
    const stats = list.map(s => ({ s, y: yasinStat(s) })).sort((a, b) => (a.y.pct ?? 101) - (b.y.pct ?? 101));
    const purata = sesi ? avg(stats.map(x => x.y.pct)) : null;
    return [
      el("div", { class: "picker" }, el("span", { class: "lbl" }, "Tarikh"),
        el("select", { id: "ydate", "aria-label": "Pilih Jumaat", onchange: e => { state.ydate = e.target.value; render(); } },
          opts.map(o => { const op = el("option", { value: o }, "Jumaat " + dmy(o) + (state.yasin[o] ? "" : " (belum direkod)")); if (o === date) op.selected = true; return op; }))),
      el("div", { class: "summary" },
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Hadir"), el("b", {}, (list.length - abs.length) + " / " + list.length)),
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Tidak hadir"), el("b", {}, String(abs.length))),
        el("div", { class: "stat" }, el("span", { class: "lbl" }, "Purata kelas (" + sesi + " Jumaat)"), el("b", {}, purata == null ? "-" : purata.toFixed(0) + "%"))),
      el("div", { class: "card" },
        el("p", { class: "hint" }, rec ? "Semua murid dikira hadir. Tekan nama murid yang tidak hadir." : "Jumaat ini belum direkod. Tekan nama yang tidak hadir, atau terus simpan."),
        el("div", { class: "att" }, list.map(s => { const out = abs.includes(s.id);
          return el("button", { class: out ? "absent" : "", "aria-pressed": String(out), onclick: () => toggleHadir(date, s.id) }, el("span", {}, s.nama), el("span", { class: "pill " + (out ? "low" : "ok") }, out ? "Tidak hadir" : "Hadir")); })),
        rec ? null : el("div", {}, el("button", { class: "btn", onclick: async () => { if (await pastikanSesi(date)) { toast("Kehadiran disimpan"); render(); } } }, "Simpan: semua hadir"))),
      el("div", { class: "card" }, el("strong", {}, "Peratus kehadiran setiap murid"),
        el("p", { class: "hint" }, "Disusun dari kehadiran paling rendah. Bawah 75% ditanda untuk tindakan."),
        el("div", { class: "tblwrap" }, el("table", {},
          el("thead", {}, el("tr", {}, el("th", {}, "Murid"), el("th", { class: "num" }, "Hadir"), el("th", { class: "num" }, "Peratus"), el("th", {}, "Status"))),
          el("tbody", {}, stats.map(({ s, y }) => { const p = y.pct; const [c, t] = p == null ? ["mid", "Tiada rekod"] : p >= 90 ? ["ok", "Konsisten"] : p >= 75 ? ["mid", "Sederhana"] : ["low", "Perlu dipantau"];
            return el("tr", {}, el("td", {}, s.nama), el("td", { class: "num" }, y.hadir + " / " + y.sesi), el("td", { class: "num" }, pct(p)), el("td", {}, el("span", { class: "pill " + c }, t))); })))))];
  },
  profil() {
    if (!state.murid.length) return [kosong()];
    const s = current(); const sc = scores(s); const [c, t] = band(sc.total); const ys = yasinStat(s);
    const plus = [], minus = [];
    QRUB.forEach(([k, l]) => { const v = s.quran[k]; if (v == null) return; if (v >= 4) plus.push(l + " baik (" + v + "/5)"); else if (v <= 2) minus.push(l + " lemah (" + v + "/5)"); });
    BIDANG.forEach((b, i) => { const v = s.tp[i]; if (v == null) return; if (v >= 5) plus.push(b + " TP" + v); else if (v <= 2) minus.push(b + " TP" + v); });
    const miss = RUKUN.filter((_, i) => !s.solat[i]);
    if (s.solat.some(Boolean)) { if (!miss.length) plus.push("Kuasai semua 13 rukun solat"); else minus.push("Rukun solat belum dikuasai: " + miss.join(", ")); }
    if (ys.pct != null) { if (ys.pct >= 90) plus.push("Kehadiran Yasin Jumaat konsisten (" + Math.round(ys.pct) + "%)"); else if (ys.pct < 75) minus.push("Kehadiran Yasin Jumaat rendah (" + ys.hadir + "/" + ys.sesi + ")"); }
    const tps = BIDANG.map((b, i) => el("div", { class: "tp" }, el("span", {}, b),
      el("select", { id: "tp" + i, "aria-label": "TP " + b, onchange: e => { s.tp[i] = +e.target.value; simpanTP(s, i); render(); } },
        s.tp[i] == null ? el("option", { value: "" }, "Belum") : null,
        [1, 2, 3, 4, 5, 6].map(n => { const o = el("option", { value: n }, "TP" + n); if (n === s.tp[i]) o.selected = true; return o; }))));
    const nota = el("textarea", { id: "catatan", maxlength: "2000", placeholder: "Contoh: Rajin jadi imam surau. Perlu latih bacaan mad.", onchange: e => { s.catatan = e.target.value; simpanCatatan(s); } }); nota.value = s.catatan;
    return [studentPicker(),
      el("div", { class: "card" },
        el("div", { style: "display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center" },
          el("div", { class: "phead" }, avatar(s.nama, true), el("div", { style: "min-width:0" }, el("div", { style: "font-family:var(--f-display);font-size:1.3rem;font-weight:700" }, s.nama), el("span", { class: "pill " + c }, t),
            el("span", { class: "hint" }, " Tahap bacaan: " + (s.quran.tahap == null ? "-" : TAHAP[s.quran.tahap]) + " · Hafazan: " + (s.quran.hafazan ?? "-") + " surah"))),
          el("div", { class: "score" }, sc.total == null ? "-" : sc.total.toFixed(1), el("small", {}, "markah keseluruhan"))),
        el("div", { class: "summary" },
          el("div", { class: "stat" }, el("span", { class: "lbl" }, "Amali solat"), el("b", {}, pct(sc.solat))),
          el("div", { class: "stat" }, el("span", { class: "lbl" }, "Al-Quran"), el("b", {}, pct(sc.quran))),
          el("div", { class: "stat" }, el("span", { class: "lbl" }, "Purata TP"), el("b", {}, sc.tpAvg == null ? "-" : sc.tpAvg.toFixed(1))),
          el("div", { class: "stat" }, el("span", { class: "lbl" }, "Yasin Jumaat"), el("b", {}, pct(ys.pct))))),
      el("div", { class: "card sw" },
        el("div", { class: "plus" }, el("h3", {}, "Kelebihan"), plus.length ? el("ul", {}, plus.map(p => el("li", {}, p))) : el("p", { class: "hint" }, "Belum ada yang menonjol.")),
        el("div", { class: "minus" }, el("h3", {}, "Kelemahan"), minus.length ? el("ul", {}, minus.map(p => el("li", {}, p))) : el("p", { class: "hint" }, "Tiada kelemahan ketara."))),
      el("div", { class: "card" }, el("strong", {}, "Tahap penguasaan (TP) ikut bidang"), el("div", { style: "display:grid;gap:8px" }, tps)),
      el("div", { class: "card" }, el("strong", {}, "Lencana pencapaian"),
        el("div", { class: "badges" }, lencana(s, { nombor1: nombor1Id() === s.id }).map(b =>
          el("div", { class: "badge" + (b.dapat ? " on" : ""), title: b.syarat }, el("span", { class: "bi" }, ikon(b.ikon, 22)), el("b", {}, b.nama), el("small", {}, b.dapat ? "Dicapai" : b.syarat))))),
      el("div", { class: "card" }, el("strong", {}, "Perkembangan markah keseluruhan"), grafSejarah(s)),
      el("div", { class: "card" }, el("strong", {}, "Catatan guru"), nota)];
  },
  urus() {
    const out = [];
    const b1 = el("button", { class: "btn", onclick: e => exportKelas(false, e.currentTarget) }, "Export kelas ini");
    const b2 = el("button", { class: "linkbtn", onclick: e => exportKelas(true, e.currentTarget) }, "Export semua kelas");
    out.push(el("div", { class: "card" }, el("strong", {}, "Export & backup"),
      el("p", { class: "hint" }, "Muat turun fail CSV yang boleh dibuka terus dalam Excel atau Google Sheets. Sesuai untuk backup, laporan PBD dan mesyuarat panitia. Simpan fail ni di tempat selamat kerana ia mengandungi data murid."),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, state.kelas ? b1 : null, b2)));
    if (state.kelas) {
      const k = state.allKelas.find(x => x.id === state.kelas);
      const ta = el("textarea", { id: "murid-baru", placeholder: "Satu nama setiap baris. Boleh paste terus dari senarai kelas." });
      out.push(el("div", { class: "card" }, el("strong", {}, "Murid kelas " + kelasLabel(k)),
        ta, el("div", {}, el("button", { class: "btn", onclick: async () => {
          const names = ta.value.split("\n").map(x => x.trim().replace(/\s+/g, " ")).filter(x => x.length >= 2).slice(0, 60);
          if (!names.length) return toast("Tiada nama untuk ditambah");
          const { error } = await sb.from("murid").insert(names.map(nama => ({ kelas_id: state.kelas, nama: nama.slice(0, 120) })));
          if (error) return gagal(error);
          toast(names.length + " murid ditambah"); state.tab = "urus"; pilihKelas(state.kelas);
        } }, "Tambah murid")),
        el("div", { class: "list" }, state.murid.map(s => el("div", { class: "li" }, el("span", {}, s.nama), confirmBtn("Keluarkan", async () => {
          const { error } = await sb.from("murid").update({ aktif: false }).eq("id", s.id);
          if (error) return gagal(error); toast(s.nama + " dikeluarkan"); pilihKelas(state.kelas);
        }))))));
    } else out.push(el("div", { class: "empty" }, "Belum ada kelas. Jalankan schema.sql dahulu."));
    if (isKetua()) out.push(...adminGuru());
    return out;
  },
};

// Butang dua langkah (confirm() tak boleh diharap dalam semua browser/app)
function confirmBtn(label, fn) {
  const b = el("button", { class: "linkbtn" }, label); let armed = false;
  b.addEventListener("click", () => { if (!armed) { armed = true; b.textContent = "Pasti?"; setTimeout(() => { armed = false; b.textContent = label; }, 3000); } else fn(); });
  return b;
}

function adminGuru() {
  if (!state.guruList.length) { loadGuru(); return [el("p", { class: "hint" }, "Memuatkan senarai guru...")]; }
  const email = el("input", { type: "text", id: "g-email", placeholder: "nama@moe-dl.edu.my" });
  const nama = el("input", { type: "text", id: "g-nama", placeholder: "Nama guru" });
  const per = el("select", { id: "g-peranan" }, el("option", { value: "guru" }, "Guru"), el("option", { value: "ketua_panitia" }, "Ketua panitia"));
  return [
    el("div", { class: "card" }, el("strong", {}, "Guru berdaftar"),
      el("div", { class: "form" }, email, nama, per, el("button", { class: "btn", onclick: async () => {
        const e = email.value.trim().toLowerCase(); const n = nama.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || n.length < 2) return toast("Isi email dan nama dengan betul");
        const { error } = await sb.from("guru").insert({ email: e, nama: n.slice(0, 120), peranan: per.value });
        if (error) return gagal(error); toast("Guru didaftarkan"); loadGuru();
      } }, "Daftar guru")),
      el("div", { class: "list" }, state.guruList.map(x => el("div", { class: "li" },
        el("span", {}, x.nama + " · " + x.email + (x.peranan === "ketua_panitia" ? " · Ketua" : "") + (x.aktif ? "" : " · tidak aktif")),
        x.id === state.me.id ? null : el("button", { class: "linkbtn", onclick: async () => {
          const { error } = await sb.from("guru").update({ aktif: !x.aktif }).eq("id", x.id); if (error) return gagal(error); loadGuru();
        } }, x.aktif ? "Nyahaktif" : "Aktifkan"))))),];
}
async function loadGuru() {
  const { data: g, error } = await sb.from("guru").select("*").order("nama");
  if (error) return gagal(error);
  state.guruList = g;
  render();
}

const TABS = [["ranking", "Ranking"], ["solat", "Amali solat"], ["quran", "Al-Quran"], ["yasin", "Yasin Jumaat"], ["profil", "Profil murid"], ["urus", "Urus"]];
function setTab(t) { state.tab = t; render(); }
function grafSejarah(s) {
  const h = state.sejarah[s.id];
  if (h === undefined) { muatSejarah(s.id); return el("p", { class: "hint" }, "Memuatkan graf..."); }
  if (h === "loading") return el("p", { class: "hint" }, "Memuatkan graf...");
  if (h.ralat) return el("p", { class: "hint" }, "Graf belum aktif. Ketua panitia perlu jalankan SQL kemas kini (markah_sejarah).");
  const d = h.filter(x => x.total != null);
  if (d.length < 2) return el("p", { class: "hint" }, "Graf akan muncul bila murid ni dah dinilai pada sekurang-kurangnya 2 hari berbeza. Markah direkod automatik setiap kali kau simpan penilaian.");
  const W = 640, H = 220, L = 36, R = 16, T = 14, B = 28;
  const t = d.map(x => new Date(x.tarikh + "T12:00:00").getTime()); const t0 = t[0], t1 = t[t.length - 1] === t0 ? t0 + 1 : t[t.length - 1];
  const X = v => L + (v - t0) / (t1 - t0) * (W - L - R), Y = v => T + (1 - v / 100) * (H - T - B);
  const NS = "http://www.w3.org/2000/svg"; const mk = (n, at) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const sv = mk("svg", { viewBox: "0 0 " + W + " " + H, class: "graf", role: "img", "aria-label": "Graf markah keseluruhan " + s.nama });
  for (const g of [0, 25, 50, 75, 100]) { sv.append(mk("line", { x1: L, x2: W - R, y1: Y(g), y2: Y(g), class: "grid" })); const tx = mk("text", { x: L - 6, y: Y(g) + 4, "text-anchor": "end", class: "ax" }); tx.textContent = g; sv.append(tx); }
  const pts = d.map((x, i) => [X(t[i]), Y(x.total)]);
  sv.append(mk("path", { d: "M" + pts.map(p => p.join(",")).join("L") + "L" + pts[pts.length - 1][0] + "," + Y(0) + "L" + pts[0][0] + "," + Y(0) + "Z", class: "area" }));
  sv.append(mk("path", { d: "M" + pts.map(p => p.join(",")).join("L"), class: "line" }));
  const lbl = (i, anchor) => { const tx = mk("text", { x: pts[i][0], y: H - 8, "text-anchor": anchor, class: "ax" }); tx.textContent = dmy(d[i].tarikh).slice(0, 5); sv.append(tx); };
  lbl(0, "start"); lbl(d.length - 1, "end");
  const tip = el("div", { class: "tip", hidden: true });
  pts.forEach((p, i) => {
    sv.append(mk("circle", { cx: p[0], cy: p[1], r: i === pts.length - 1 ? 5 : 3.5, class: "dot" + (i === pts.length - 1 ? " last" : "") }));
    const hit = mk("circle", { cx: p[0], cy: p[1], r: 14, class: "hit", tabindex: 0 });
    const show = () => { const x = d[i]; tip.replaceChildren(el("b", {}, dmy(x.tarikh) + ": " + x.total.toFixed(1)), el("span", {}, "Solat " + pct(x.solat) + " · Quran " + pct(x.quran) + " · TP " + pct(x.tp)));
      tip.hidden = false; tip.style.left = (p[0] / W * 100) + "%"; tip.style.top = (p[1] / H * 100) + "%"; };
    hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
    hit.addEventListener("pointerleave", () => tip.hidden = true); hit.addEventListener("blur", () => tip.hidden = true);
    sv.append(hit);
  });
  const last = d[d.length - 1], first = d[0], beza = last.total - first.total;
  const lt = mk("text", { x: pts[pts.length - 1][0] - 8, y: pts[pts.length - 1][1] - 10, "text-anchor": "end", class: "val" }); lt.textContent = last.total.toFixed(1); sv.append(lt);
  return el("div", {}, el("p", { class: "hint" }, (beza >= 0 ? "Naik " : "Turun ") + Math.abs(beza).toFixed(1) + " markah sejak " + dmy(first.tarikh) + "."),
    el("div", { class: "chartwrap" }, sv, tip));
}

function render() {
  const nav = el("nav", { class: "tabs", role: "tablist" }, TABS.map(([k, l]) => el("button", { role: "tab", "aria-selected": String(state.tab === k), onclick: () => setTab(k) }, l)));
  const view = el("section", { class: "panel" }, views[state.tab]());
  $("#app").replaceChildren(nav, view);
}

sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !state.me) boot(); });
boot();

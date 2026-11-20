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

const state = { me: null, kelasList: [], allKelas: [], kelas: null, tab: "ranking", sid: null, murid: [], yasin: {}, ydate: null, adminGuru: null, guruList: [] };

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
async function pilihKelas(kid) {
  state.kelas = kid; state.sid = null;
  $("#app").replaceChildren(el("p", { class: "hint" }, "Memuatkan kelas..."));
  const { data: m, error } = await sb.from("murid").select("id,nama").eq("kelas_id", kid).eq("aktif", true).order("nama");
  if (error) return gagal(error);
  const ids = m.map(x => x.id);
  let S = [], Q = [], T = [], C = [];
  if (ids.length) {
    const r = await Promise.all([
      sb.from("penilaian_solat").select("*").in("murid_id", ids),
      sb.from("penilaian_quran").select("*").in("murid_id", ids),
      sb.from("penilaian_tp").select("*").in("murid_id", ids),
      sb.from("catatan_guru").select("*").in("murid_id", ids),
    ]);
    const bad = r.find(x => x.error); if (bad) return gagal(bad.error);
    [S, Q, T, C] = r.map(x => x.data);
  }
  const by = (arr, id) => arr.find(x => x.murid_id === id);
  state.murid = m.map(x => {
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
  if (ey) return gagal(ey);
  state.yasin = {};
  for (const s of ses) state.yasin[s.tarikh] = { id: s.id, absent: s.yasin_tidak_hadir.map(a => a.murid_id) };
  renderTop(); render();
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
async function simpanSolat(s) { const { error } = await sb.from("penilaian_solat").upsert({ murid_id: s.id, rukun: s.solat, ...stamp() }); error ? gagal(error) : toast("Disimpan"); }
async function simpanQuran(s) { const { error } = await sb.from("penilaian_quran").upsert({ murid_id: s.id, ...s.quran, ...stamp() }); error ? gagal(error) : toast("Disimpan"); }
async function simpanTP(s, i) { const { error } = await sb.from("penilaian_tp").upsert({ murid_id: s.id, bidang: BIDANG[i], tp: s.tp[i], ...stamp() }); error ? gagal(error) : toast("Disimpan"); }
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
              x.y.pct == null ? null : el("span", {}, "Yasin " + pct(x.y.pct)))),
          el("span", { class: "score" }, x.sc.total == null ? "-" : x.sc.total.toFixed(1), el("small", {}, "/ 100")));
      })),
    ];
  },
  solat() {
    if (!state.murid.length) return [kosong()];
    const s = current(); const done = s.solat.filter(Boolean).length;
    return [studentPicker(), el("div", { class: "card" },
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
      el("div", { class: "card" }, el("strong", {}, "Catatan guru"), nota)];
  },
  urus() {
    const out = [];
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
function render() {
  const nav = el("nav", { class: "tabs", role: "tablist" }, TABS.map(([k, l]) => el("button", { role: "tab", "aria-selected": String(state.tab === k), onclick: () => setTab(k) }, l)));
  const view = el("section", { class: "panel" }, views[state.tab]());
  $("#app").replaceChildren(nav, view);
}

sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !state.me) boot(); });
boot();

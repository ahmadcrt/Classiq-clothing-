/* CLASSEEQ admin dashboard v2. The browser only ever holds the public anon key and the signed-in user's own token.
   Every write is enforced on the server (Row Level Security + the admin-users Edge Function). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const QS = ["XS", "S", "M", "L", "XL", "XXL"], IDLE_MS = 30 * 60 * 1000;
  const st = { products: [], cats: [], activity: [], noActivity: false, admins: null, editing: null, fresh: false, items: [], sizes: [], colours: [], busy: false };
  let idle;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const money = (n) => (n == null || n === "" ? "-" : "\u20A6" + Number(n).toLocaleString("en-NG"));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const LOW = () => Math.max(0, parseInt(localStorage.getItem("classeeq.low"), 10) || 5);
  const stockState = (p) => (!p.in_stock || p.stock_qty === 0 ? "out" : p.stock_qty != null && p.stock_qty <= LOW() ? "low" : "ok");
  function ago(d) { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago"; if (s < 86400) return Math.floor(s / 3600) + " h ago"; return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  function msg(e) {
    const m = (e && e.message) || "Something went wrong";
    if (e && e.status === 403) return "Permission denied. Only authorised administrators can do this.";
    if (/stock_qty/.test(m)) return "Stock quantity needs the v2 database upgrade (supabase/upgrade-v2.sql).";
    if (/not found|Failed to fetch/i.test(m) && /function|fetch/i.test(m)) return "Team service is not deployed yet. Deploy the admin-users Edge Function (see README).";
    return m;
  }
  const busy = (b, on, label) => { b.disabled = on; b.classList.toggle("busy", on); if (on) { b._h = b.innerHTML; b.innerHTML = ic("spin") + (label || "Please wait..."); } else if (b._h) b.innerHTML = b._h; };

  function toast(m, type) {
    const t = document.createElement("div"); t.className = "toast " + (type || "ok"); t.setAttribute("role", type === "err" ? "alert" : "status"); t.textContent = m;
    $("#toasts").appendChild(t); requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 450); }, 4800);
  }
  function confirmBox(title, text, ok) {
    return new Promise((res) => {
      const d = $("#dlg"); $("#dt").textContent = title; $("#dm").textContent = text; $("#dok").textContent = ok || "Confirm";
      const done = (v) => { $("#dok").onclick = $("#dno").onclick = d.oncancel = null; if (d.open) d.close(); res(v); };
      $("#dok").onclick = () => done(true); $("#dno").onclick = () => done(false); d.oncancel = (e) => { e.preventDefault(); done(false); };
      d.showModal();
    });
  }

  /* ---------- navigation ---------- */
  const titles = { overview: "Overview", products: "Products", form: "Product", categories: "Categories", team: "Team & Administrators", activity: "Activity history", settings: "Settings & Security" };
  const openNav = (o) => { $("#sb").classList.toggle("open", o); $("#shade").classList.toggle("on", o); $("#burger").setAttribute("aria-expanded", o); };
  function go(v) {
    if (!titles[v]) v = "overview";
    $$(".view").forEach((el) => { el.hidden = el.id !== "v-" + v; });
    $$("#sb [data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
    $("#vt").textContent = v === "form" ? (st.editing ? "Edit product" : "Add product") : titles[v];
    openNav(false); window.scrollTo(0, 0);
    if (v === "team") loadTeam(); if (v === "settings") renderSettings();
  }
  function route() {
    const v = (location.hash || "#overview").slice(1);
    if (v === "form" && !st.fresh) { st.editing = null; resetForm(null); }
    st.fresh = false; go(v);
  }

  /* ---------- data ---------- */
  async function load() {
    $("#stats").innerHTML = '<div class="sk"></div>'.repeat(6);
    const [p, c, a] = await Promise.all([
      SB.rest("products?select=*&order=created_at.desc", { auth: true }),
      SB.rest("categories?select=*&order=name.asc", { auth: true }),
      SB.rest("activity_log?select=*&order=created_at.desc&limit=150", { auth: true }).then((r) => { st.noActivity = false; return r; }).catch(() => { st.noActivity = true; return []; })]);
    st.products = p || []; st.cats = c || []; st.activity = a || []; renderAll();
  }
  const renderAll = () => { renderStats(); renderBars(); renderLow(); renderRecent(); renderFeed(); renderCatFilters(); renderTable(); renderCats(); fillCatSelect(); renderActivity(); };
  const thumb = (p) => (p.images && p.images[0] ? `<img class="th" loading="lazy" src="${esc(SB.publicUrl(p.images[0]))}" alt="">` : '<span class="th"></span>');

  function renderStats() {
    const P = st.products, n = (f) => P.filter(f).length;
    const d = [["package", "Total products", P.length], ["eye", "Published", n((p) => p.is_published)], ["eyeoff", "Unpublished", n((p) => !p.is_published)], ["tag", "Categories", st.cats.length],
      ["alert", "Low stock", n((p) => stockState(p) === "low"), "warn"], ["x", "Out of stock", n((p) => stockState(p) === "out"), "warn"]];
    $("#stats").innerHTML = d.map((x) => `<div class="stat ${x[3] || ""}"><span class="si">${ic(x[0])}</span><small>${x[1]}</small><b>${x[2]}</b></div>`).join("");
  }
  function renderBars() {
    const rows = st.cats.map((c) => [c.name, st.products.filter((p) => p.category === c.name).length]), max = Math.max(1, ...rows.map((r) => r[1]));
    $("#bars").innerHTML = rows.map((r) => `<div class="bar"><span>${esc(r[0])}</span><div class="t"><div style="width:${r[1] / max * 100}%"></div></div><b>${r[1]}</b></div>`).join("") || '<p class="muted">No categories yet.</p>';
  }
  function renderLow() {
    const r = st.products.filter((p) => stockState(p) !== "ok").sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0)).slice(0, 6);
    $("#lowl").innerHTML = r.length ? r.map((p) => `<div class="rc">${thumb(p)}<div><b>${esc(p.name)}</b><small class="muted">${esc(p.category)}</small></div>${stockTag(p)}</div>`).join("") : '<p class="muted pad">All products are well stocked.</p>';
  }
  function stockTag(p) { const s = stockState(p); return s === "out" ? '<span class="tag out">Out of stock</span>' : s === "low" ? `<span class="tag low">Low: ${p.stock_qty}</span>` : p.stock_qty != null ? `<span class="tag ok">${p.stock_qty} in stock</span>` : '<span class="muted">-</span>'; }
  function renderRecent() {
    const r = st.products.slice(0, 5);
    $("#recent").innerHTML = r.length ? r.map((p) => `<div class="rc">${thumb(p)}<div><b>${esc(p.name)}</b><small class="muted">${esc(p.category)} \u2022 ${money(p.price)}</small></div><span class="tag${p.is_published ? " f" : ""}">${p.is_published ? "Live" : "Draft"}</span></div>`).join("") : '<p class="muted pad">No products yet. Add your first product.</p>';
  }
  const ACT = { product_added: ["plus", "added"], product_updated: ["pencil", "edited"], product_published: ["eye", "published"], product_unpublished: ["eyeoff", "unpublished"], product_deleted: ["trash", "deleted"], category_added: ["tag", "added category"], category_deleted: ["trash", "deleted category"], admin_invited: ["userplus", "invited admin"], admin_revoked: ["lock", "revoked admin"] };
  const actRow = (a) => { const t = ACT[a.action] || ["activity", a.action], who = (a.actor_email || "System").split("@")[0], nm = a.details && (a.details.name || a.details.email) || a.entity_id || ""; return `<div class="ac"><span class="ci">${ic(t[0])}</span><div><b>${esc(who)} ${esc(t[1])}</b><small class="muted">${esc(nm)}</small></div><small class="muted">${ago(a.created_at)}</small></div>`; };
  function renderFeed() { $("#feed").innerHTML = st.activity.length ? st.activity.slice(0, 6).map(actRow).join("") : `<p class="muted pad">${st.noActivity ? "Run supabase/upgrade-v2.sql to enable activity history." : "No activity yet."}</p>`; }
  function renderActivity() {
    const q = $("#aq").value.trim().toLowerCase(), f = $("#af").value;
    const r = st.activity.filter((a) => (!f || a.entity === f) && (!q || (a.actor_email + " " + a.action + " " + JSON.stringify(a.details)).toLowerCase().includes(q)));
    $("#al").innerHTML = r.length ? r.map(actRow).join("") : `<p class="muted pad">${st.noActivity ? "Run supabase/upgrade-v2.sql to enable activity history." : "No matching activity."}</p>`;
  }
  const renderCatFilters = () => { const cur = $("#fc").value; $("#fc").innerHTML = '<option value="">All categories</option>' + st.cats.map((c) => `<option>${esc(c.name)}</option>`).join(""); $("#fc").value = st.cats.some((c) => c.name === cur) ? cur : ""; };
  const sorters = { new: (a, b) => b.created_at.localeCompare(a.created_at), old: (a, b) => a.created_at.localeCompare(b.created_at), az: (a, b) => a.name.localeCompare(b.name), pl: (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12), ph: (a, b) => (b.price ?? -1) - (a.price ?? -1), stock: (a, b) => (a.stock_qty ?? 1e9) - (b.stock_qty ?? 1e9) };
  function renderTable() {
    const q = $("#q").value.trim().toLowerCase(), fc = $("#fc").value, fs = $("#fs").value;
    const rows = st.products.filter((p) => (!q || (p.name + " " + p.category + " " + p.description).toLowerCase().includes(q)) && (!fc || p.category === fc) &&
      (!fs || (fs === "pub" ? p.is_published : fs === "draft" ? !p.is_published : stockState(p) === fs))).sort(sorters[$("#so2").value] || sorters.new);
    $("#tb tbody").innerHTML = rows.map((p) => `<tr data-id="${esc(p.id)}"><td class="nm"><div class="pc">${thumb(p)}<div><b>${esc(p.name)}</b>${p.is_new ? '<span class="tag">New</span>' : ""}${p.is_featured ? '<span class="tag f">Featured</span>' : ""}</div></div></td>` +
      `<td data-l="Category">${esc(p.category)}</td><td data-l="Price">${money(p.price)}</td><td data-l="Stock">${stockTag(p)}</td>` +
      `<td data-l="Published"><label class="sw"><input type="checkbox" data-tg="is_published" aria-label="Published"${p.is_published ? " checked" : ""}><span></span></label></td>` +
      `<td data-l="Actions"><div class="ab"><button class="ib" data-act="edit" aria-label="Edit ${esc(p.name)}">${ic("pencil")}</button><button class="ib d" data-act="del" aria-label="Delete ${esc(p.name)}">${ic("trash")}</button></div></td></tr>`).join("");
    $("#empty").hidden = rows.length > 0; $("#tb").hidden = rows.length === 0; $("#cnt").textContent = `${rows.length} of ${st.products.length} products`;
  }
  function renderCats() {
    $("#cl").innerHTML = st.cats.map((c) => { const n = st.products.filter((p) => p.category === c.name).length;
      return `<div class="cr"><div><b>${esc(c.name)}</b> <span class="muted">${n} product${n === 1 ? "" : "s"}</span></div><button class="ib d" data-cat="${esc(c.name)}" aria-label="Delete category ${esc(c.name)}"${n ? ' disabled title="Move or delete its products first"' : ""}>${ic("trash")}</button></div>`; }).join("") || '<p class="muted pad">No categories.</p>';
  }
  const fillCatSelect = () => { const cur = $("#pc").value; $("#pc").innerHTML = st.cats.map((c) => `<option>${esc(c.name)}</option>`).join(""); if (cur) $("#pc").value = cur; };
  ["#q", "#fc", "#fs", "#so2"].forEach((s) => $(s).addEventListener("input", renderTable)); ["#aq", "#af"].forEach((s) => $(s).addEventListener("input", renderActivity));

  /* ---------- product actions ---------- */
  $("#tb tbody").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-tg]"); if (!cb) return;
    const id = cb.closest("tr").dataset.id, v = cb.checked, p = st.products.find((x) => x.id === id); cb.disabled = true;
    SB.rest("products?id=eq." + encodeURIComponent(id), { method: "PATCH", body: { is_published: v }, auth: true }).then((r) => {
      if (!r || !r.length) throw new Error("Update was not permitted"); p.is_published = v; renderStats(); renderRecent(); toast(v ? "Product published to website" : "Product hidden from website"); refreshActivity();
    }).catch((er) => { cb.checked = !v; toast(msg(er), "err"); }).then(() => { cb.disabled = false; });
  });
  $("#tb tbody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return; const id = b.closest("tr").dataset.id, p = st.products.find((x) => x.id === id);
    if (b.dataset.act === "edit") { st.editing = p; resetForm(p); st.fresh = true; location.hash = "#form"; return; }
    confirmBox("Delete product?", `\u201C${p.name}\u201D and its pictures will be permanently removed from the website.`, "Delete").then((ok) => {
      if (!ok) return;
      SB.rest("products?id=eq." + encodeURIComponent(id), { method: "DELETE", auth: true }).then((r) => {
        if (!r || !r.length) throw new Error("Delete was not permitted");
        SB.removeFiles(p.images); st.products = st.products.filter((x) => x.id !== id); renderAll(); toast("Product deleted"); refreshActivity();
      }).catch((er) => toast(msg(er), "err"));
    });
  });
  const newProduct = () => { st.editing = null; resetForm(null); st.fresh = true; };
  $$("[data-new]").forEach((a) => a.addEventListener("click", newProduct)); $("#nf").addEventListener("click", newProduct);
  function refreshActivity() { SB.rest("activity_log?select=*&order=created_at.desc&limit=150", { auth: true }).then((a) => { st.activity = a || []; renderFeed(); renderActivity(); }).catch(() => {}); }

  $("#cf").addEventListener("submit", (e) => {
    e.preventDefault(); const n = $("#cn").value.trim(); if (!n) return;
    SB.rest("categories", { method: "POST", body: { name: n }, auth: true }).then((r) => { st.cats.push(r[0]); st.cats.sort((a, b) => a.name.localeCompare(b.name)); $("#cn").value = ""; renderAll(); toast("Category added"); refreshActivity(); })
      .catch((er) => toast(er.status === 409 ? "That category already exists" : msg(er), "err"));
  });
  $("#cl").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b || b.disabled) return; const n = b.dataset.cat;
    confirmBox("Delete category?", `Remove the category \u201C${n}\u201D?`, "Delete").then((ok) => {
      if (!ok) return;
      SB.rest("categories?name=eq." + encodeURIComponent(n), { method: "DELETE", auth: true }).then((r) => { if (!r || !r.length) throw new Error("Delete was not permitted"); st.cats = st.cats.filter((c) => c.name !== n); renderAll(); toast("Category deleted"); refreshActivity(); }).catch((er) => toast(msg(er), "err"));
    });
  });

  /* ---------- product form ---------- */
  function chips(kind) {
    $(kind === "sizes" ? "#sc" : "#cc").innerHTML = st[kind].map((v, i) => `<span class="chip">${esc(v)}<button type="button" data-k="${kind}" data-i="${i}" aria-label="Remove ${esc(v)}">${ic("x")}</button></span>`).join("");
    if (kind === "sizes") $$("#qs button").forEach((b) => { b.style.background = st.sizes.includes(b.textContent) ? "var(--gold)" : ""; });
  }
  const addChip = (kind, v) => { v = v.trim().slice(0, 30); if (v && !st[kind].includes(v)) { st[kind].push(v); chips(kind); } };
  $("#qs").innerHTML = QS.map((s) => `<button type="button">${s}</button>`).join("");
  $("#qs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const i = st.sizes.indexOf(b.textContent); i >= 0 ? st.sizes.splice(i, 1) : st.sizes.push(b.textContent); chips("sizes"); });
  [["#si", "sizes"], ["#ci", "colours"]].forEach(([s, k]) => {
    $(s).addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(k, e.target.value); e.target.value = ""; } });
    $(s).addEventListener("blur", (e) => { addChip(k, e.target.value); e.target.value = ""; });
  });
  $("#pf").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) { st[b.dataset.k].splice(+b.dataset.i, 1); chips(b.dataset.k); } });

  const renderImgs = () => { $("#imgs").innerHTML = st.items.map((it, i) => `<div class="im${i ? "" : " cv"}">${i ? "" : '<span class="cvl">Cover</span>'}<img src="${esc(it.url)}" alt="Picture ${i + 1}"><div class="bt">${i ? `<button type="button" data-cover="${i}" aria-label="Make cover" title="Make cover">${ic("star")}</button>` : ""}<button type="button" data-rm="${i}" aria-label="Remove picture" title="Remove">${ic("x")}</button></div></div>`).join(""); };
  $("#imgs").addEventListener("click", (e) => {
    const c = e.target.closest("[data-cover]"), r = e.target.closest("[data-rm]");
    if (c) { st.items.unshift(st.items.splice(+c.dataset.cover, 1)[0]); renderImgs(); }
    if (r) { const g = st.items.splice(+r.dataset.rm, 1)[0]; if (g.file) URL.revokeObjectURL(g.url); renderImgs(); }
  });
  function addFiles(list) {
    [...list].forEach((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast(f.name + " is not a JPG, PNG or WebP image", "err");
      if (f.size > 15 * 1024 * 1024) return toast(f.name + " is larger than 15 MB", "err");
      st.items.push({ file: f, url: URL.createObjectURL(f) });
    }); renderImgs();
  }
  const dz = $("#dz"), fi = $("#fi");
  dz.addEventListener("click", () => fi.click()); dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
  fi.addEventListener("change", () => { addFiles(fi.files); fi.value = ""; });
  ["dragenter", "dragover"].forEach((n) => dz.addEventListener(n, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((n) => dz.addEventListener(n, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  function resetForm(p) {
    st.editing = p; $("#pn").value = p ? p.name : ""; $("#pp").value = p && p.price != null ? p.price : ""; $("#pd").value = p ? p.description : ""; $("#fq").value = p && p.stock_qty != null ? p.stock_qty : "";
    fillCatSelect(); if (p) $("#pc").value = p.category;
    st.sizes = p ? p.sizes.slice() : []; st.colours = p ? p.colours.slice() : []; chips("sizes"); chips("colours");
    $("#fn").checked = !!(p && p.is_new); $("#ff").checked = !!(p && p.is_featured); $("#fk").checked = p ? p.in_stock : true; $("#fp").checked = p ? p.is_published : false;
    st.items.forEach((i) => { if (i.file) URL.revokeObjectURL(i.url); });
    st.items = p ? p.images.map((x) => ({ path: x, url: SB.publicUrl(x) })) : []; renderImgs();
    $("#fe").hidden = true; $("#pg").hidden = true; $("#sv").disabled = false;
  }
  const shrink = (file) => new Promise((res, rej) => {
    const im = new Image(), u = URL.createObjectURL(file);
    im.onload = () => {
      const s = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); c.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", .86);
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Could not read " + file.name)); }; im.src = u;
  });
  const ferr = (m) => { $("#fe").textContent = m; $("#fe").hidden = false; $("#fe").scrollIntoView({ block: "center", behavior: "smooth" }); };

  $("#pf").addEventListener("submit", async (e) => {
    e.preventDefault(); if (st.busy) return;
    const name = $("#pn").value.trim(), price = $("#pp").value.trim(), cat = $("#pc").value, qty = $("#fq").value.trim(); $("#fe").hidden = true;
    if (!name) return ferr("Please enter the product name.");
    if (!cat) return ferr("Please choose a category (add one under Categories first).");
    if (price !== "" && (isNaN(price) || Number(price) < 0)) return ferr("Price must be a positive number.");
    if (qty !== "" && (!/^\d+$/.test(qty))) return ferr("Stock quantity must be a whole number (0 or more).");
    if (!st.items.length) return ferr("Please add at least one picture.");
    const id = st.editing ? st.editing.id : uuid(), oldImgs = st.editing ? st.editing.images.slice() : [], fresh = st.items.filter((i) => i.file), uploaded = []; let done = 0;
    st.busy = true; busy($("#sv"), true, "Saving..."); $("#pg").hidden = false;
    const bar = (f) => { const pc = fresh.length ? Math.round((done + f) / fresh.length * 100) : 100; $("#pg div").style.width = pc + "%"; $("#pg span").textContent = fresh.length ? "Uploading pictures " + pc + "%" : "Saving..."; };
    bar(0);
    try {
      for (const it of fresh) {
        const blob = await shrink(it.file), path = `products/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        await SB.upload(path, blob, bar); uploaded.push(path); it.path = path; done++; bar(0);
      }
      $("#pg span").textContent = "Saving product...";
      const row = { name, price: price === "" ? null : Number(price), description: $("#pd").value.trim(), category: cat, sizes: st.sizes, colours: st.colours, images: st.items.map((i) => i.path), is_new: $("#fn").checked, is_featured: $("#ff").checked, in_stock: $("#fk").checked, is_published: $("#fp").checked };
      if (qty !== "") { row.stock_qty = +qty; if (+qty === 0) row.in_stock = false; } else if (st.editing && "stock_qty" in st.editing) row.stock_qty = null;
      const r = st.editing ? await SB.rest("products?id=eq." + encodeURIComponent(id), { method: "PATCH", body: row, auth: true }) : await SB.rest("products", { method: "POST", body: { id, ...row }, auth: true });
      if (!r || !r.length) throw new Error("Save was not permitted");
      SB.removeFiles(oldImgs.filter((x) => !r[0].images.includes(x)));
      toast(st.editing ? "Product updated" : "Product added" + (r[0].is_published ? " and live on the website" : " (unpublished draft)"));
      st.editing = null; await load(); location.hash = "#products";
    } catch (er) { SB.removeFiles(uploaded); ferr(msg(er)); toast(msg(er), "err"); }
    st.busy = false; busy($("#sv"), false); setTimeout(() => { $("#pg").hidden = true; }, 600);
  });
  $("#cx").addEventListener("click", () => { st.editing = null; });

  /* ---------- team & administrators ---------- */
  let FN = null; /* works whether the function was deployed as admin-users or admin-users- */
  async function teamFn(body) {
    let last; for (const n of FN ? [FN] : ["admin-users", "admin-users-"]) { try { const r = await SB.fn(n, body); FN = n; return r; } catch (e) { last = e; if (e.status !== 404) throw e; } } throw last;
  }
  async function loadTeam() {
    $("#tl").innerHTML = '<div class="sk" style="margin:16px"></div>';
    try { st.admins = (await teamFn({ action: "list" })).admins; renderTeam(); }
    catch (e) { $("#tl").innerHTML = `<p class="err pad">${esc(msg(e))}</p>`; }
  }
  function renderTeam() {
    const n = st.admins.length;
    $("#tl").innerHTML = st.admins.map((a) => `<div class="tm"><span class="av">${esc(a.email[0] || "?")}</span><div><b>${esc(a.email)}</b><small class="muted">${a.confirmed ? (a.last_sign_in_at ? "Last sign in " + ago(a.last_sign_in_at) : "Never signed in") : "Invitation pending"} \u2022 Added ${ago(a.added_at)}</small></div>${a.is_you ? '<span class="tag f">You</span>' : ""}` +
      `<button class="ib d" data-rv="${esc(a.user_id)}" data-em="${esc(a.email)}" aria-label="Revoke access for ${esc(a.email)}"${a.is_you || n <= 1 ? ' disabled title="' + (a.is_you ? "You cannot remove yourself" : "The last administrator is protected") + '"' : ""}>${ic("lock")}</button></div>`).join("");
  }
  $("#tr").addEventListener("click", loadTeam);
  $("#tl").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rv]"); if (!b || b.disabled) return;
    confirmBox("Revoke administrator access?", `${b.dataset.em} will lose access to the dashboard immediately. Their login account is kept.`, "Revoke").then(async (ok) => {
      if (!ok) return;
      try { await teamFn({ action: "revoke", user_id: b.dataset.rv }); toast("Administrator access revoked"); loadTeam(); refreshActivity(); } catch (er) { toast(msg(er), "err"); }
    });
  });
  $("#tc").addEventListener("change", (e) => { $("#tpw").hidden = !e.target.checked; });
  $("#tf").addEventListener("submit", async (e) => {
    e.preventDefault(); const em = $("#te").value.trim(), tmp = $("#tc").checked ? $("#tp").value : "", er = $("#tfe"); er.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { er.textContent = "Enter a valid email address."; er.hidden = false; return; }
    if ($("#tc").checked && tmp.length < 8) { er.textContent = "Temporary password must be at least 8 characters."; er.hidden = false; return; }
    busy($("#tb2"), true, "Inviting...");
    try {
      const r = await teamFn({ action: "invite", email: em, password: tmp || undefined, redirectTo: location.origin + location.pathname });
      toast(r.mode === "invited" ? "Invitation email sent to " + em : r.mode === "created" ? "Administrator account created for " + em : em + " is now an administrator");
      $("#te").value = ""; $("#tp").value = ""; $("#tc").checked = false; $("#tpw").hidden = true; loadTeam(); refreshActivity();
    } catch (x) { er.textContent = msg(x); er.hidden = false; }
    busy($("#tb2"), false);
  });

  /* ---------- settings & security ---------- */
  function renderSettings() { const s = SB.session(); $("#se1").textContent = s && s.user ? s.user.email : ""; $("#se2").textContent = s && s.user && s.user.last_sign_in_at ? new Date(s.user.last_sign_in_at).toLocaleString() : "This session"; $("#lt").value = LOW(); }
  function strength(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; }
  $("#cp1").addEventListener("input", (e) => { const s = strength(e.target.value), m = $(".meter div"); m.style.width = s * 20 + "%"; m.style.background = s < 3 ? "var(--red)" : s < 4 ? "#E69B00" : "var(--ok)"; });
  $("#cpf").addEventListener("submit", async (e) => {
    e.preventDefault(); const c0 = $("#cp0").value, c1 = $("#cp1").value, c2 = $("#cp2").value, er = $("#cpe"); er.hidden = true;
    const bad = (m) => { er.textContent = m; er.hidden = false; };
    if (!c0) return bad("Enter your current password."); if (c1.length < 8) return bad("New password must be at least 8 characters.");
    if (c1 !== c2) return bad("New password and confirmation do not match."); if (c1 === c0) return bad("New password must be different from the current one.");
    busy($("#cpb"), true, "Updating...");
    try {
      try { await SB.signIn(SB.session().user.email, c0); } catch (x) { throw new Error("Current password is incorrect."); }
      await SB.updatePassword(c1); $("#cpf").reset(); $(".meter div").style.width = "0"; toast("Password updated successfully");
    } catch (x) { bad(msg(x)); }
    busy($("#cpb"), false);
  });
  $("#ltb").addEventListener("click", () => { localStorage.setItem("classeeq.low", Math.max(0, parseInt($("#lt").value, 10) || 0)); renderAll(); toast("Low-stock threshold saved"); });
  $("#so3").addEventListener("click", () => logout());
  $$("[data-eye]").forEach((b) => b.addEventListener("click", () => { const i = $("#" + b.dataset.eye), show = i.type === "password"; i.type = show ? "text" : "password"; b.innerHTML = ic(show ? "eyeoff" : "eye"); }));

  /* ---------- auth ---------- */
  const show = (id) => ["cfg", "login", "setpw", "app"].forEach((x) => { $("#" + x).hidden = x !== id; });
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => logout("You were signed out after 30 minutes of inactivity."), IDLE_MS); };
  function logout(m) { clearTimeout(idle); SB.signOut().then(() => { show("login"); $("#pw").value = ""; $("#lo").hidden = true; $("#le").hidden = !m; if (m) $("#le").textContent = m; }); }
  async function enter() {
    const r = await SB.rest("admins?select=user_id", { auth: true });
    if (!r || !r.length) { await SB.signOut(); throw new Error("not-admin"); }
    show("app"); const u = SB.session().user; $("#who").textContent = (u && u.email) || ""; resetIdle(); await load(); route();
  }
  const loginMsg = (er) => /not-admin/.test(er.message) ? "This account is not authorised to use the admin dashboard." : /invalid login credentials/i.test(er.message) ? "Invalid email or password." : /not confirmed/i.test(er.message) ? "Email not confirmed. Confirm the user in Supabase > Authentication > Users." : /api key|apikey|jwt/i.test(er.message) ? "Wrong anon key in config.js." : er.message === "Failed to fetch" ? "Cannot reach Supabase. Check SUPABASE_URL in config.js." : msg(er);
  $("#lf").addEventListener("submit", async (e) => {
    e.preventDefault(); const le = $("#le"); le.hidden = true; $("#lo").hidden = true; const em = $("#em").value.trim(), pw = $("#pw").value;
    if (!em || !pw) { le.textContent = "Enter your email and password."; le.hidden = false; return; }
    busy($("#lb"), true, "Signing in...");
    try { await SB.signIn(em, pw); await enter(); } catch (er) { le.textContent = loginMsg(er); le.hidden = false; $("#pw").value = ""; }
    busy($("#lb"), false);
  });
  $("#fp").addEventListener("click", async () => {
    const em = $("#em").value.trim(), le = $("#le"), lo = $("#lo"); le.hidden = true; lo.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { le.textContent = "Type your email above first, then press Forgot your password."; le.hidden = false; return; }
    try { await SB.recover(em, location.origin + location.pathname); lo.textContent = "If that email has an account, a password reset link is on its way."; lo.hidden = false; } catch (er) { le.textContent = msg(er); le.hidden = false; }
  });
  $("#sf").addEventListener("submit", async (e) => {
    e.preventDefault(); const a = $("#sp1").value, b = $("#sp2").value, er = $("#se"); er.hidden = true;
    if (a.length < 8) { er.textContent = "Password must be at least 8 characters."; er.hidden = false; return; } if (a !== b) { er.textContent = "Passwords do not match."; er.hidden = false; return; }
    busy($("#sb2"), true, "Saving...");
    try { await SB.updatePassword(a); toast("Password saved"); await enter(); } catch (x) { er.textContent = /not-admin/.test(x.message) ? "This account is not authorised to use the admin dashboard." : msg(x); er.hidden = false; show(x.message === "not-admin" ? "login" : "setpw"); }
    busy($("#sb2"), false);
  });
  $("#so").addEventListener("click", () => logout());
  $("#burger").addEventListener("click", () => openNav(!$("#sb").classList.contains("open"))); $("#shade").addEventListener("click", () => openNav(false));
  addEventListener("hashchange", () => { if (!$("#app").hidden) route(); });
  ["click", "keydown", "pointerdown", "scroll"].forEach((n) => addEventListener(n, () => { if (!$("#app").hidden) resetIdle(); }, { passive: true }));
  addEventListener("beforeunload", (e) => { if (st.busy) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- boot (also handles invite / recovery links) ---------- */
  async function boot() {
    if (!SB.configured()) return show("cfg");
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("error_description")) { history.replaceState(null, "", location.pathname); show("login"); $("#le").textContent = h.get("error_description").replace(/\+/g, " ") + ". Request a new link with Forgot your password."; $("#le").hidden = false; return; }
    if (h.get("access_token") && /^(invite|recovery|signup|magiclink)$/.test(h.get("type") || "")) {
      const t = { access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: h.get("expires_in") }, type = h.get("type");
      history.replaceState(null, "", location.pathname);
      try { await SB.setSession(t); $("#sft").textContent = type === "invite" ? "Welcome, set your password" : "Set a new password"; return show("setpw"); } catch (e) { show("login"); $("#le").textContent = "This link is invalid or has expired."; $("#le").hidden = false; return; }
    }
    if (SB.session()) { try { await enter(); } catch (e) { show("login"); if (/not-admin/.test(e.message)) { $("#le").textContent = loginMsg(e); $("#le").hidden = false; } } } else show("login");
  }
  boot();
})();

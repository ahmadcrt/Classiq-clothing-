/* CLASSEEQ admin dashboard. All writes are enforced server-side by Supabase Row Level Security;
   this UI only improves the experience. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var QS = ["XS", "S", "M", "L", "XL", "XXL"], IDLE_MS = 30 * 60 * 1000;
  var st = { products: [], cats: [], editing: null, items: [], sizes: [], colours: [], busy: false }, idle;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); }
  function money(n) { return n == null || n === "" ? "-" : "\u20A6" + Number(n).toLocaleString("en-NG"); }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }); }
  function msg(e) { return e && e.status === 403 ? "Permission denied. Is this account an authorised admin?" : (e && e.message) || "Something went wrong"; }

  function toast(m, type) {
    var t = document.createElement("div"); t.className = "toast " + (type || "ok"); t.setAttribute("role", type === "err" ? "alert" : "status"); t.textContent = m;
    $("#toasts").appendChild(t); requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 450); }, 4500);
  }
  function confirmBox(title, text, ok) {
    return new Promise(function (res) {
      var d = $("#dlg"); $("#dt").textContent = title; $("#dm").textContent = text; $("#dok").textContent = ok || "Confirm";
      function done(v) { $("#dok").onclick = $("#dno").onclick = d.oncancel = null; if (d.open) d.close(); res(v); }
      $("#dok").onclick = function () { done(true); }; $("#dno").onclick = function () { done(false); }; d.oncancel = function (e) { e.preventDefault(); done(false); };
      d.showModal();
    });
  }

  /* ---------- navigation ---------- */
  var titles = { overview: "Overview", products: "Products", form: "Product", categories: "Categories" };
  function openNav(o) { $("#sb").classList.toggle("open", o); $("#shade").classList.toggle("on", o); $("#burger").setAttribute("aria-expanded", o); }
  function go(v) {
    if (!titles[v]) v = "overview";
    $$(".view").forEach(function (el) { el.hidden = el.id !== "v-" + v; });
    $$("#sb [data-v]").forEach(function (a) { a.classList.toggle("on", a.dataset.v === v); });
    $("#vt").textContent = v === "form" ? (st.editing ? "Edit product" : "Add product") : titles[v];
    openNav(false); window.scrollTo(0, 0);
  }
  function route() {
    var v = (location.hash || "#overview").slice(1);
    if (v === "form" && !st.editing && !st.fresh) resetForm(null);
    st.fresh = false; go(v);
  }

  /* ---------- data ---------- */
  function load() {
    return Promise.all([SB.rest("products?select=*&order=created_at.desc", { auth: true }), SB.rest("categories?select=*&order=name.asc", { auth: true })]).then(function (r) {
      st.products = r[0] || []; st.cats = r[1] || []; renderAll();
    });
  }
  function renderAll() { renderStats(); renderRecent(); renderCatFilters(); renderTable(); renderCats(); fillCatSelect(); }
  function thumb(p) { return p.images && p.images[0] ? '<img class="th" loading="lazy" src="' + esc(SB.publicUrl(p.images[0])) + '" alt="">' : '<span class="th"></span>'; }

  function renderStats() {
    var P = st.products, c = function (f) { return P.filter(f).length; };
    var d = [["Total products", P.length], ["Published", c(function (p) { return p.is_published; })], ["Unpublished", c(function (p) { return !p.is_published; })], ["Categories", st.cats.length], ["New arrivals", c(function (p) { return p.is_new; })], ["Featured", c(function (p) { return p.is_featured; })]];
    $("#stats").innerHTML = d.map(function (x) { return '<div class="stat"><small>' + x[0] + "</small><b>" + x[1] + "</b></div>"; }).join("");
  }
  function renderRecent() {
    var r = st.products.slice(0, 5);
    $("#recent").innerHTML = r.length ? r.map(function (p) { return '<div class="rc">' + thumb(p) + "<div><b>" + esc(p.name) + "</b><small class=\"muted\">" + esc(p.category) + " \u2022 " + money(p.price) + "</small></div><span class=\"tag" + (p.is_published ? " f" : "") + '">' + (p.is_published ? "Live" : "Draft") + "</span></div>"; }).join("") : '<p class="muted pad">No products yet. Add your first product.</p>';
  }
  function renderCatFilters() {
    var cur = $("#fc").value, o = '<option value="">All categories</option>' + st.cats.map(function (c) { return "<option>" + esc(c.name) + "</option>"; }).join("");
    $("#fc").innerHTML = o; $("#fc").value = st.cats.some(function (c) { return c.name === cur; }) ? cur : "";
  }
  function renderTable() {
    var q = $("#q").value.trim().toLowerCase(), fc = $("#fc").value, fs = $("#fs").value;
    var rows = st.products.filter(function (p) {
      return (!q || (p.name + " " + p.category + " " + p.description).toLowerCase().indexOf(q) >= 0) && (!fc || p.category === fc) &&
        (!fs || (fs === "pub" ? p.is_published : fs === "draft" ? !p.is_published : !p.in_stock));
    });
    $("#tb tbody").innerHTML = rows.map(function (p) {
      return '<tr data-id="' + esc(p.id) + '"><td class="nm"><div class="pc">' + thumb(p) + "<div><b>" + esc(p.name) + "</b>" + (p.is_new ? '<span class="tag">New</span>' : "") + (p.is_featured ? '<span class="tag f">Featured</span>' : "") + "</div></div></td>" +
        '<td data-l="Category">' + esc(p.category) + '</td><td data-l="Price">' + money(p.price) + "</td>" +
        '<td data-l="Published"><label class="sw"><input type="checkbox" data-tg="is_published" aria-label="Published"' + (p.is_published ? " checked" : "") + "><span></span></label></td>" +
        '<td data-l="In stock"><label class="sw"><input type="checkbox" data-tg="in_stock" aria-label="In stock"' + (p.in_stock ? " checked" : "") + "><span></span></label></td>" +
        '<td data-l="Actions"><div class="ab"><button class="ib" data-act="edit" aria-label="Edit ' + esc(p.name) + '">&#9998;</button><button class="ib d" data-act="del" aria-label="Delete ' + esc(p.name) + '">&#128465;</button></div></td></tr>';
    }).join("");
    $("#empty").hidden = rows.length > 0; $("#tb").hidden = rows.length === 0;
  }
  function renderCats() {
    $("#cl").innerHTML = st.cats.map(function (c) {
      var n = st.products.filter(function (p) { return p.category === c.name; }).length;
      return '<div class="cr"><div><b>' + esc(c.name) + '</b> <span class="muted">' + n + ' product' + (n === 1 ? "" : "s") + '</span></div><button class="ib d" data-cat="' + esc(c.name) + '" aria-label="Delete category ' + esc(c.name) + '"' + (n ? " disabled title=\"Move or delete its products first\"" : "") + ">&#128465;</button></div>";
    }).join("") || '<p class="muted pad">No categories.</p>';
  }
  function fillCatSelect() {
    var cur = $("#pc").value; $("#pc").innerHTML = st.cats.map(function (c) { return "<option>" + esc(c.name) + "</option>"; }).join(""); if (cur) $("#pc").value = cur;
  }

  /* ---------- product actions ---------- */
  $("#tb tbody").addEventListener("change", function (e) {
    var cb = e.target.closest("[data-tg]"); if (!cb) return;
    var id = cb.closest("tr").dataset.id, f = cb.dataset.tg, v = cb.checked, p = st.products.filter(function (x) { return x.id === id; })[0], body = {}; body[f] = v;
    cb.disabled = true;
    SB.rest("products?id=eq." + encodeURIComponent(id), { method: "PATCH", body: body, auth: true }).then(function (r) {
      if (!r || !r.length) throw new Error("Update was not permitted");
      p[f] = v; renderStats(); renderRecent(); toast(f === "is_published" ? (v ? "Product published to website" : "Product hidden from website") : (v ? "Marked in stock" : "Marked out of stock"));
    }).catch(function (er) { cb.checked = !v; toast(msg(er), "err"); }).then(function () { cb.disabled = false; });
  });
  $("#tb tbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return; var id = b.closest("tr").dataset.id, p = st.products.filter(function (x) { return x.id === id; })[0];
    if (b.dataset.act === "edit") { st.editing = p; resetForm(p); st.fresh = true; location.hash = "#form"; }
    else confirmBox("Delete product?", "\u201C" + p.name + "\u201D and its pictures will be permanently removed from the website.", "Delete").then(function (ok) {
      if (!ok) return;
      SB.rest("products?id=eq." + encodeURIComponent(id), { method: "DELETE", auth: true }).then(function (r) {
        if (!r || !r.length) throw new Error("Delete was not permitted");
        SB.removeFiles(p.images); st.products = st.products.filter(function (x) { return x.id !== id; }); renderAll(); toast("Product deleted");
      }).catch(function (er) { toast(msg(er), "err"); });
    });
  });
  ["#q", "#fc", "#fs"].forEach(function (s) { $(s).addEventListener("input", renderTable); });
  $$("[data-new]").forEach(function (a) { a.addEventListener("click", function () { st.editing = null; resetForm(null); st.fresh = true; }); });
  $("#nf").addEventListener("click", function () { st.editing = null; resetForm(null); st.fresh = true; });

  $("#cf").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("#cn").value.trim(); if (!n) return;
    SB.rest("categories", { method: "POST", body: { name: n }, auth: true }).then(function (r) { st.cats.push(r[0]); st.cats.sort(function (a, b) { return a.name.localeCompare(b.name); }); $("#cn").value = ""; renderAll(); toast("Category added"); })
      .catch(function (er) { toast(er.status === 409 ? "That category already exists" : msg(er), "err"); });
  });
  $("#cl").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b || b.disabled) return; var n = b.dataset.cat;
    confirmBox("Delete category?", "Remove the category \u201C" + n + "\u201D?", "Delete").then(function (ok) {
      if (!ok) return;
      SB.rest("categories?name=eq." + encodeURIComponent(n), { method: "DELETE", auth: true }).then(function (r) { if (!r || !r.length) throw new Error("Delete was not permitted"); st.cats = st.cats.filter(function (c) { return c.name !== n; }); renderAll(); toast("Category deleted"); }).catch(function (er) { toast(msg(er), "err"); });
    });
  });

  /* ---------- product form ---------- */
  function chips(kind) {
    var box = kind === "sizes" ? $("#sc") : $("#cc");
    box.innerHTML = st[kind].map(function (v, i) { return '<span class="chip">' + esc(v) + '<button type="button" data-k="' + kind + '" data-i="' + i + '" aria-label="Remove ' + esc(v) + '">&times;</button></span>'; }).join("");
    if (kind === "sizes") $$("#qs button").forEach(function (b) { b.style.background = st.sizes.indexOf(b.textContent) >= 0 ? "var(--gold)" : ""; });
  }
  function addChip(kind, v) { v = v.trim().slice(0, 30); if (v && st[kind].indexOf(v) < 0) { st[kind].push(v); chips(kind); } }
  $("#qs").innerHTML = QS.map(function (s) { return '<button type="button">' + s + "</button>"; }).join("");
  $("#qs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var i = st.sizes.indexOf(b.textContent); i >= 0 ? st.sizes.splice(i, 1) : st.sizes.push(b.textContent); chips("sizes"); });
  [["#si", "sizes"], ["#ci", "colours"]].forEach(function (x) {
    $(x[0]).addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(x[1], this.value); this.value = ""; } });
    $(x[0]).addEventListener("blur", function () { addChip(x[1], this.value); this.value = ""; });
  });
  $("#pf").addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (b) { st[b.dataset.k].splice(+b.dataset.i, 1); chips(b.dataset.k); } });

  function renderImgs() {
    $("#imgs").innerHTML = st.items.map(function (it, i) {
      return '<div class="im' + (i ? "" : " cv") + '">' + (i ? "" : '<span class="cvl">Cover</span>') + '<img src="' + esc(it.url) + '" alt="Picture ' + (i + 1) + '"><div class="bt">' + (i ? '<button type="button" data-cover="' + i + '" aria-label="Make cover" title="Make cover">&#9733;</button>' : "") + '<button type="button" data-rm="' + i + '" aria-label="Remove picture" title="Remove">&times;</button></div></div>';
    }).join("");
  }
  $("#imgs").addEventListener("click", function (e) {
    var c = e.target.closest("[data-cover]"), r = e.target.closest("[data-rm]");
    if (c) { var it = st.items.splice(+c.dataset.cover, 1)[0]; st.items.unshift(it); renderImgs(); }
    if (r) { var g = st.items.splice(+r.dataset.rm, 1)[0]; if (g.file) URL.revokeObjectURL(g.url); renderImgs(); }
  });
  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(f.name + " is not a JPG, PNG or WebP image", "err"); return; }
      if (f.size > 15 * 1024 * 1024) { toast(f.name + " is larger than 15 MB", "err"); return; }
      st.items.push({ file: f, url: URL.createObjectURL(f) });
    }); renderImgs();
  }
  var dz = $("#dz"), fi = $("#fi");
  dz.addEventListener("click", function () { fi.click(); }); dz.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
  fi.addEventListener("change", function () { addFiles(fi.files); fi.value = ""; });
  ["dragenter", "dragover"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.remove("over"); }); });
  dz.addEventListener("drop", function (e) { addFiles(e.dataTransfer.files); });

  function resetForm(p) {
    st.editing = p; $("#pn").value = p ? p.name : ""; $("#pp").value = p && p.price != null ? p.price : ""; $("#pd").value = p ? p.description : "";
    fillCatSelect(); if (p) $("#pc").value = p.category;
    st.sizes = p ? p.sizes.slice() : []; st.colours = p ? p.colours.slice() : []; chips("sizes"); chips("colours");
    $("#fn").checked = !!(p && p.is_new); $("#ff").checked = !!(p && p.is_featured); $("#fk").checked = p ? p.in_stock : true; $("#fp").checked = p ? p.is_published : false;
    st.items.forEach(function (i) { if (i.file) URL.revokeObjectURL(i.url); });
    st.items = p ? p.images.map(function (x) { return { path: x, url: SB.publicUrl(x) }; }) : []; renderImgs();
    $("#fe").hidden = true; $("#pg").hidden = true; $("#sv").disabled = false;
  }
  function shrink(file) {
    return new Promise(function (res, rej) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var m = 1600, s = Math.min(1, m / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); c.toBlob(function (b) { b ? res(b) : rej(new Error("Could not process image")); }, "image/jpeg", .86);
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Could not read " + file.name)); }; im.src = u;
    });
  }
  function ferr(m) { $("#fe").textContent = m; $("#fe").hidden = false; $("#fe").scrollIntoView({ block: "center", behavior: "smooth" }); }

  $("#pf").addEventListener("submit", function (e) {
    e.preventDefault(); if (st.busy) return;
    var name = $("#pn").value.trim(), price = $("#pp").value.trim(), cat = $("#pc").value;
    $("#fe").hidden = true;
    if (!name) return ferr("Please enter the product name.");
    if (!cat) return ferr("Please choose a category (add one under Categories first).");
    if (price !== "" && (isNaN(price) || Number(price) < 0)) return ferr("Price must be a positive number.");
    if (!st.items.length) return ferr("Please add at least one picture.");
    var id = st.editing ? st.editing.id : uuid(), oldImgs = st.editing ? st.editing.images.slice() : [], fresh = st.items.filter(function (i) { return i.file; }), uploaded = [], done = 0;
    st.busy = true; $("#sv").disabled = true; $("#pg").hidden = false;
    function bar(f) { var pc = fresh.length ? Math.round((done + f) / fresh.length * 100) : 100; $("#pg div").style.width = pc + "%"; $("#pg span").textContent = fresh.length ? "Uploading pictures " + pc + "%" : "Saving..."; }
    bar(0);
    fresh.reduce(function (p, it) {
      return p.then(function () { return shrink(it.file); }).then(function (blob) {
        var path = "products/" + id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
        return SB.upload(path, blob, bar.bind(null)).then(function () { uploaded.push(path); it.path = path; done++; bar(0); });
      });
    }, Promise.resolve()).then(function () {
      $("#pg span").textContent = "Saving product...";
      var row = { name: name, price: price === "" ? null : Number(price), description: $("#pd").value.trim(), category: cat, sizes: st.sizes, colours: st.colours, images: st.items.map(function (i) { return i.path; }), is_new: $("#fn").checked, is_featured: $("#ff").checked, in_stock: $("#fk").checked, is_published: $("#fp").checked };
      return st.editing ? SB.rest("products?id=eq." + encodeURIComponent(id), { method: "PATCH", body: row, auth: true }) : SB.rest("products", { method: "POST", body: Object.assign({ id: id }, row), auth: true });
    }).then(function (r) {
      if (!r || !r.length) throw new Error("Save was not permitted");
      var kept = r[0].images; SB.removeFiles(oldImgs.filter(function (x) { return kept.indexOf(x) < 0; }));
      toast(st.editing ? "Product updated" : "Product added" + (r[0].is_published ? " and live on the website" : " (unpublished draft)"));
      st.editing = null; return load().then(function () { location.hash = "#products"; });
    }).catch(function (er) { SB.removeFiles(uploaded); ferr(msg(er)); toast(msg(er), "err"); })
      .then(function () { st.busy = false; $("#sv").disabled = false; setTimeout(function () { $("#pg").hidden = true; }, 600); });
  });
  $("#cx").addEventListener("click", function () { st.editing = null; });

  /* ---------- auth ---------- */
  function show(id) { ["cfg", "login", "app"].forEach(function (x) { $("#" + x).hidden = x !== id; }); }
  function resetIdle() { clearTimeout(idle); idle = setTimeout(function () { logout("You were signed out after 30 minutes of inactivity."); }, IDLE_MS); }
  function logout(m) { clearTimeout(idle); SB.signOut().then(function () { show("login"); $("#pw").value = ""; if (m) { $("#le").textContent = m; $("#le").hidden = false; } }); }
  function enter() {
    return SB.rest("admins?select=user_id", { auth: true }).then(function (r) {
      if (!r || !r.length) return SB.signOut().then(function () { throw new Error("not-admin"); });
      show("app"); $("#who").textContent = SB.session().user && SB.session().user.email || ""; resetIdle();
      return load().then(route);
    });
  }
  $("#lf").addEventListener("submit", function (e) {
    e.preventDefault(); var b = $("#lb"), le = $("#le"); le.hidden = true;
    var em = $("#em").value.trim(), pw = $("#pw").value; if (!em || !pw) { le.textContent = "Enter your email and password."; le.hidden = false; return; }
    b.disabled = true; b.textContent = "Signing in...";
    SB.signIn(em, pw).then(enter).catch(function (er) {
      le.textContent = er.message === "not-admin" ? "This account is not authorised to use the admin dashboard." : /invalid login credentials/i.test(er.message) ? "Invalid email or password. (Check the user exists under Authentication > Users.)" : /not confirmed/i.test(er.message) ? "Email not confirmed. In Supabase > Authentication > Users, open the user and confirm the email (or tick Auto Confirm when creating it)." : /api key|apikey|jwt/i.test(er.message) ? "Wrong anon key in config.js. Copy the anon public key from Supabase > Project Settings > API." : er.message === "Failed to fetch" ? "Cannot reach Supabase. Check SUPABASE_URL in config.js (it must start with https://)." : msg(er); le.hidden = false; $("#pw").value = "";
    }).then(function () { b.disabled = false; b.textContent = "Sign in"; });
  });
  $("#so").addEventListener("click", function () { logout(); });
  $("#burger").addEventListener("click", function () { openNav(!$("#sb").classList.contains("open")); }); $("#shade").addEventListener("click", function () { openNav(false); });
  window.addEventListener("hashchange", function () { if (!$("#app").hidden) route(); });
  ["click", "keydown", "pointerdown", "scroll"].forEach(function (n) { window.addEventListener(n, function () { if (!$("#app").hidden) resetIdle(); }, { passive: true }); });
  window.addEventListener("beforeunload", function (e) { if (st.busy) { e.preventDefault(); e.returnValue = ""; } });

  if (!SB.configured()) show("cfg");
  else if (SB.session()) enter().catch(function () { show("login"); }); else show("login");
})();

/* Minimal Supabase client (Auth, PostgREST, Storage) with no dependencies.
   Only ever uses the public anon key + the signed-in user's own access token. */
(function (w) {
  "use strict";
  var C = w.CLASSEEQ_CONFIG || {}, U = String(C.SUPABASE_URL || "").replace(/\/+$/, ""), K = String(C.SUPABASE_ANON_KEY || ""),
    SK = "classeeq.admin.session", BUCKET = "product-images", S = null;
  try { S = JSON.parse(localStorage.getItem(SK) || "null"); } catch (e) { S = null; }

  function configured() { return /^https?:\/\//.test(U) && K.length > 20 && U.indexOf("YOUR-") < 0 && K.indexOf("YOUR-") < 0; }
  function keep(s) { S = s; try { s ? localStorage.setItem(SK, JSON.stringify(s)) : localStorage.removeItem(SK); } catch (e) {} }
  function pack(b) { return { access_token: b.access_token, refresh_token: b.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (b.expires_in || 3600), user: b.user }; }
  function fail(r, b) { var e = new Error((b && (b.msg || b.message || b.error_description || b.error)) || ("HTTP " + r.status)); e.status = r.status; return e; }

  function raw(path, o) {
    o = o || {};
    var h = { apikey: K, Authorization: "Bearer " + (o.auth && S ? S.access_token : K) };
    var isBlob = typeof Blob !== "undefined" && o.body instanceof Blob;
    if (o.body !== undefined && !isBlob) h["Content-Type"] = "application/json";
    if (o.headers) for (var k in o.headers) h[k] = o.headers[k];
    return fetch(U + path, { method: o.method || "GET", headers: h, body: o.body === undefined ? undefined : (isBlob ? o.body : JSON.stringify(o.body)) });
  }
  function refresh() {
    if (!S || !S.refresh_token) return Promise.reject(new Error("No session"));
    return raw("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: S.refresh_token } }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) {
        if (!r.ok || !b || !b.access_token) { keep(null); throw fail(r, b); }
        keep(pack(b));
      });
    });
  }
  function ready() { return S && S.expires_at - 30 < Date.now() / 1000 ? refresh() : Promise.resolve(); }

  function rest(path, o) {
    o = o || {};
    return (o.auth ? ready() : Promise.resolve()).then(function () {
      var h = { Prefer: "return=representation" };
      if (o.headers) for (var k in o.headers) h[k] = o.headers[k];
      return raw("/rest/v1/" + path, { method: o.method, body: o.body, auth: o.auth, headers: h });
    }).then(function (r) {
      return r.text().then(function (t) {
        var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw fail(r, b);
        return b;
      });
    });
  }
  function signIn(email, password) {
    return raw("/auth/v1/token?grant_type=password", { method: "POST", body: { email: email, password: password } }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (b) {
        if (!r.ok || !b || !b.access_token) throw fail(r, b);
        keep(pack(b)); return S;
      });
    });
  }
  function signOut() {
    var p = S ? raw("/auth/v1/logout", { method: "POST", auth: true }).catch(function () {}) : Promise.resolve();
    return p.then(function () { keep(null); });
  }
  function enc(path) { return path.split("/").map(encodeURIComponent).join("/"); }
  function publicUrl(path) { return U + "/storage/v1/object/public/" + BUCKET + "/" + enc(path); }
  function upload(path, blob, onProgress) {
    return ready().then(function () {
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest();
        x.open("POST", U + "/storage/v1/object/" + BUCKET + "/" + enc(path));
        x.setRequestHeader("apikey", K); x.setRequestHeader("Authorization", "Bearer " + S.access_token);
        x.setRequestHeader("Content-Type", blob.type || "image/jpeg"); x.setRequestHeader("x-upsert", "false");
        x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        x.onload = function () { x.status < 300 ? res(path) : rej(new Error("Image upload failed (" + x.status + ")")); };
        x.onerror = function () { rej(new Error("Network error during upload")); };
        x.send(blob);
      });
    });
  }
  function removeFiles(paths) {
    if (!paths || !paths.length) return Promise.resolve();
    return ready().then(function () { return raw("/storage/v1/object/" + BUCKET, { method: "DELETE", auth: true, body: { prefixes: paths } }); }).catch(function () {});
  }
  w.SB = { configured: configured, rest: rest, session: function () { return S; }, signIn: signIn, signOut: signOut, upload: upload, removeFiles: removeFiles, publicUrl: publicUrl };
})(window);

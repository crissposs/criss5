const fs = require("fs");
const path = require("path");
const os = require("os");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const storage = require("../modules/girlsonly/storage");
const { PERU_CITY_DISTRICTS } = require("../modules/girlsonly/peru-catalog");

if (!process.env.ENABLE_GIRLSONLY) {
    process.env.ENABLE_GIRLSONLY = "1";
}

const { startBot, stopBot } = require("../index");

storage.ensureStorage();

const app = express();
const MAX_PROFILE_PHOTOS = 10;
const MAX_PROFILE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
    dest: storage.MODELS_DIR,
    limits: {
        files: MAX_PROFILE_PHOTOS,
        fileSize: MAX_PROFILE_PHOTO_SIZE_BYTES
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())) {
            cb(null, true);
            return;
        }
        cb(new Error("Solo se aceptan imagenes JPG, PNG o WEBP."));
    }
});

const PORT = process.env.PORT || 3000;
const users = {
    criss: "pupi",
    alip: "po#23"
};

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.WEB_SESSION_SECRET || "girlsonly-session-secret",
    resave: false,
    saveUninitialized: false
}));

app.use("/models", express.static(storage.MODELS_DIR));
app.use("/captures", express.static(storage.CAPTURES_DIR));

function requireAuth(req, res, next) {
    if (req.session?.user) {
        next();
        return;
    }
    res.redirect("/login");
}

function esc(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;");
}

function assetUrl(filePath, mount) {
    return filePath ? `${mount}/${path.basename(filePath)}` : "";
}

function normalizeProfilePhotoPaths(profile) {
    const candidates = [];
    if (Array.isArray(profile?.photoPaths)) {
        candidates.push(...profile.photoPaths);
    }
    if (Array.isArray(profile?.fotos)) {
        candidates.push(...profile.fotos);
    }
    if (profile?.photoPath) {
        candidates.push(profile.photoPath);
    }
    if (profile?.foto) {
        candidates.push(profile.foto);
    }
    const seen = new Set();
    const unique = [];
    for (const item of candidates) {
        const normalized = String(item || "").trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        unique.push(normalized);
    }
    return unique.slice(0, MAX_PROFILE_PHOTOS);
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleString("es-PE", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function profileLocation(profile) {
    return profile.locationLabel || `${profile.cityName || profile.cityId} - ${profile.provinceName || profile.provinceId}`;
}

function profileContact(profile) {
    return [profile.contactName || "", profile.contactPhone || ""].filter(Boolean).join(" · ") || "-";
}

function getNotificationsData() {
    const payments = storage.getPayments().payments || [];
    const queue = storage.getApprovalQueue().items || [];
    const pendingPayments = payments
        .filter((item) => item.status === "pending")
        .map((item) => ({
            type: "payment",
            id: item.id,
            title: `Nuevo pago: ${item.profileName || item.profileId || "Perfil"}`,
            subtitle: `Metodo: ${item.paymentMethod || "-"} · chat.id: ${item.chatId || "-"}`,
            createdAt: item.createdAt || null
        }));
    const pendingQueue = queue
        .filter((item) => item.status === "pending")
        .map((item) => ({
            type: "queue",
            id: item.id,
            title: `Accion pendiente: ${item.action || "sin accion"}`,
            subtitle: `paymentId: ${item.paymentId || "-"} · admin: ${item.approvedBy || "-"}`,
            createdAt: item.createdAt || null
        }));

    const items = [...pendingPayments, ...pendingQueue]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return {
        unreadCount: items.length,
        items
    };
}

function getSourceMeta(source) {
    const key = String(source || "").trim().toLowerCase();
    if (key === "glambu" || key === "gambu") {
        return {
            label: "Glambu",
            logo: "https://i.ibb.co/7JxsVkkC/unnamed.jpg"
        };
    }
    if (key === "seeking") {
        return {
            label: "Seeking",
            logo: "https://i.ibb.co/j9v1YjJC/images.png"
        };
    }
    return {
        label: "Sin dato",
        logo: ""
    };
}

function buildProfileTemplateHtml(profile) {
    const sourceMeta = getSourceMeta(profile.source);
    return `<div class="profile-template">
      <p>||Æ beneficio mutuo 🇵🇪||</p>
      <p>╭━━━━━━━━━━━⪨</p>
      <p>┊🙍‍♀️ <strong>Nombre</strong> : ${esc(profile.name || "")}</p>
      <p>╰━━━━━━━━━━━⪨</p>
      <p>┊📌 <strong>Zona</strong> : ${esc(profileLocation(profile))}</p>
      <p>┊📱 <strong>Aplicacion</strong> : ${esc(sourceMeta.label)}</p>
      <p>┊🎂 <strong>Velitas</strong> : ${esc(profile.velitas || "")}</p>
      <p>┊💗 <strong>Contacto</strong> : ${esc(profileContact(profile))}</p>
      <p>┊━━━━━━━━━━━⪨</p>
      <p>┊💵 <strong>Precio</strong> : ${esc(profile.price || "")}</p>
      <p>╰━━━━━━━━━━━⪨</p>
      <p>||Æ beneficio mutuo 🇵🇪||</p>
    </div>`;
}

function buildMainPage(req) {
    const cities = storage.listCities();
    const profiles = storage.listProfiles();
    const payments = storage.getPayments().payments || [];
    const notifications = getNotificationsData();
    const inboxPreview = notifications.items.slice(0, 5).map((item) => (
        `<div class="inbox-item"><strong>${esc(item.title)}</strong><p>${esc(item.subtitle)}</p></div>`
    )).join("") || '<div class="empty">No tienes notificaciones pendientes.</div>';
    const pending = payments.filter((item) => item.status === "pending").length;
    const enabled = process.env.ENABLE_GIRLSONLY === "1";
    const uptimeHours = (process.uptime() / 3600).toFixed(1);
    const content = `
      <section class="hero panel">
        <div class="pill">Centro principal</div>
        <h1>Æ beneficio mutuo 🇵🇪</h1>
        <p>Control del bot, catalogo y pagos en una sola vista.</p>
      </section>
      <section class="metrics">
        <article class="metric"><small>Bot</small><strong>${enabled ? "Activo" : "Inactivo"}</strong></article>
        <article class="metric"><small>Perfiles</small><strong>${profiles.length}</strong></article>
        <article class="metric"><small>Pendientes</small><strong>${pending}</strong></article>
        <article class="metric"><small>Ciudades</small><strong>${cities.length}</strong></article>
        <article class="metric"><small>Notificaciones</small><strong>${notifications.unreadCount}</strong></article>
      </section>
      <section class="cards-grid">
        <article class="mini-card">
          <h3>Estado del bot</h3>
          <p>${enabled ? "Corriendo con GirlsOnly habilitado." : "GirlsOnly no esta habilitado en este proceso."}</p>
        </article>
        <article class="mini-card">
          <h3>Velocidad del bot</h3>
          <p>Cola de aprobaciones en ciclo cada 5 segundos. Uptime web: ${uptimeHours} h.</p>
        </article>
        <article class="mini-card">
          <h3>Servidor del bot</h3>
          <p>${esc(`${os.type()} ${os.release()} (${os.arch()})`)}</p>
        </article>
        <article class="mini-card">
          <h3>Creador del bot</h3>
          <p>@tata</p>
        </article>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>🔔 Buzon de notificaciones</h2>
            <p>Actividad reciente de pagos y acciones por revisar.</p>
          </div>
          <div class="pill-row"><a class="pill" href="/notifications">Abrir bandeja completa</a></div>
        </div>
        <div class="inbox-list">${inboxPreview}</div>
      </section>`;
    return shell("Principal", content, req);
}

function shell(title, content, req, pageScript = "") {
    const notifications = req?.session?.user ? getNotificationsData() : { unreadCount: 0 };
    const notificationsBadge = notifications.unreadCount > 0 ? `<span class="notif-badge">${notifications.unreadCount}</span>` : "";
    const defaultScript = req?.session?.user ? `<script>
      (function () {
        const pageLoader = document.getElementById('page-loader');
        const topLoader = document.getElementById('top-loader');
        window.addEventListener('load', function () {
          if (pageLoader) {
            pageLoader.classList.add('hide');
            setTimeout(function () { pageLoader.remove(); }, 260);
          }
          if (topLoader) {
            topLoader.classList.add('done');
          }
          document.body.classList.add('ready');
        });
      })();
    </script>` : "";

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root {
      --bg: #06060a;
      --bg-soft: #0d0d14;
      --panel: rgba(16, 16, 22, 0.82);
      --panel-soft: rgba(24, 24, 33, 0.92);
      --line: rgba(255, 255, 255, 0.08);
      --line-strong: rgba(255, 255, 255, 0.14);
      --text: #f4f3f8;
      --muted: #9b9eab;
      --pink: #ff4d8d;
      --pink-soft: #ff8eb9;
      --pink-deep: #8f214f;
      --shadow: 0 32px 90px rgba(0, 0, 0, 0.45);
      --radius: 28px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      font-family: "SF Pro Display", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 12%, rgba(255, 77, 141, 0.18), transparent 22%),
        radial-gradient(circle at 82% 10%, rgba(255, 142, 185, 0.12), transparent 18%),
        radial-gradient(circle at 50% 120%, rgba(143, 33, 79, 0.35), transparent 26%),
        linear-gradient(180deg, #06060a 0%, #0b0b11 44%, #06060a 100%);
      min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #ffd2e4;
    }
    .shell {
      width: min(1400px, calc(100vw - 32px));
      margin: 22px auto;
      display: grid;
      grid-template-columns: 270px minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }
    .sidebar, .panel, .metric, .city-card, .profile-card, .payment-card, .login-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      box-shadow: var(--shadow);
    }
    .sidebar {
      padding: 18px;
      position: sticky;
      top: 22px;
    }
    .brand {
      padding: 18px;
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
        linear-gradient(180deg, rgba(255, 77, 141, 0.10), rgba(255,255,255,0));
      border: 1px solid var(--line);
      margin-bottom: 16px;
    }
    .brand small {
      display: block;
      margin-bottom: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
    }
    .brand strong {
      display: block;
      font-size: 20px;
      line-height: 0.95;
      letter-spacing: -0.05em;
    }
    .brand span { color: var(--pink-soft); }
    .brand p {
      margin: 10px 0 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 14px;
    }
    .nav {
      display: grid;
      gap: 10px;
      margin-bottom: 16px;
    }
    .nav a {
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
      border: 1px solid transparent;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .nav a:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: rgba(255,255,255,0.06);
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 18px;
      padding: 14px 16px;
      color: white;
      cursor: pointer;
      font-weight: 700;
      background: linear-gradient(135deg, var(--pink), #d42c6f 54%, var(--pink-deep));
      box-shadow: 0 16px 34px rgba(255, 77, 141, 0.2);
    }
    .ghost {
      background: rgba(255,255,255,0.04);
      box-shadow: none;
      border: 1px solid var(--line);
    }
    .danger {
      background: linear-gradient(135deg, #5a2036, #2f101a);
      box-shadow: none;
    }
    .main {
      display: grid;
      gap: 22px;
    }
    .hero {
      padding: 26px;
      background:
        linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
        linear-gradient(180deg, rgba(255, 77, 141, 0.08), rgba(255,255,255,0));
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: clamp(26px, 3vw, 38px);
      line-height: 0.94;
      letter-spacing: -0.06em;
      max-width: 760px;
    }
    .hero p {
      margin: 0;
      max-width: 720px;
      color: var(--muted);
      line-height: 1.6;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .metric {
      padding: 20px;
      min-height: 138px;
      display: grid;
      align-content: space-between;
    }
    .metric small {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
    }
    .metric strong {
      font-size: 28px;
      letter-spacing: -0.06em;
    }
    .stack {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(380px, 1fr);
      gap: 22px;
      align-items: start;
    }
    .stack.single { grid-template-columns: minmax(0, 1fr); }
    .panel { padding: 18px; }
    .panel h2 {
      margin: 0 0 8px;
      font-size: 24px;
      letter-spacing: -0.04em;
    }
    .lead {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .toolbar-copy {
      max-width: 620px;
    }
    .toolbar-copy h2 {
      margin: 0 0 6px;
    }
    .toolbar-copy p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 7px 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.05);
      color: #f0eff4;
      font-size: 12px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .mini-card {
      padding: 18px;
      border-radius: 22px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--line);
    }
    .mini-card h3 {
      margin: 0 0 8px;
      font-size: 20px;
      letter-spacing: -0.04em;
    }
    .mini-card p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .form-grid, .list, .actions, .cluster {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .split {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    label.meta {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 12px;
    }
    input, select, textarea {
      width: 100%;
      padding: 14px 15px;
      border-radius: 18px;
      border: 1px solid var(--line);
      outline: none;
      color: var(--text);
      background: var(--panel-soft);
    }
    input:focus, select:focus, textarea:focus {
      border-color: rgba(255, 142, 185, 0.48);
      box-shadow: 0 0 0 4px rgba(255, 77, 141, 0.08);
    }
    textarea {
      min-height: 110px;
      resize: vertical;
    }
    .hint {
      margin: -4px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .city-card, .profile-card, .payment-card {
      padding: 18px;
    }
    .profiles-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .profile-card {
      display: grid;
      grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    .profile-gallery {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      align-content: start;
    }
    .profile-gallery.main-only {
      grid-template-columns: 1fr;
    }
    .profile-gallery img {
      width: 100%;
      object-fit: contain;
      background: #0a0a0f;
    }
    .payment-card img {
      width: 100%;
      height: 190px;
      object-fit: cover;
      border-radius: 22px;
      border: 1px solid var(--line);
      background: #111;
    }
    .profile-gallery img {
      height: 98px;
      border-radius: 16px;
      border: 1px solid var(--line);
    }
    .profile-gallery.main-only img {
      height: 190px;
      border-radius: 22px;
    }
    .payment-media {
      display: grid;
      align-items: start;
    }
    .section-title {
      margin: 18px 0 10px;
      font-size: 15px;
      letter-spacing: 0.08em;
      color: var(--muted);
      text-transform: uppercase;
    }
    .profile-template {
      margin-top: 14px;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.03);
      font-size: 14px;
      line-height: 1.5;
    }
    .profile-template p {
      margin: 0 0 4px;
      white-space: pre-wrap;
    }
    .profile-template p:last-child {
      margin-bottom: 0;
    }
    .source-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 6px 10px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.05);
      font-size: 12px;
    }
    .source-badge img {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      object-fit: cover;
      border: 1px solid var(--line);
    }
    .source-legend {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .preview-gallery {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .preview-gallery img {
      width: 100%;
      height: 96px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #0a0a0f;
    }
    .muted { color: var(--muted); }
    .empty {
      padding: 18px;
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
      border: 1px dashed rgba(255,255,255,0.08);
      color: var(--muted);
    }
    .city-card h3, .profile-card h3, .payment-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: -0.04em;
    }
    .login-wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-card {
      width: min(460px, 100%);
      padding: 26px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
        linear-gradient(180deg, rgba(255, 77, 141, 0.1), rgba(255,255,255,0));
    }
    .login-card h1 {
      margin: 0 0 8px;
      font-size: 30px;
      letter-spacing: -0.06em;
    }
    .login-card p {
      margin: 0 0 18px;
      color: var(--muted);
    }
    .top-loader {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 100%;
      background: linear-gradient(90deg, var(--pink), var(--pink-soft));
      transform-origin: left center;
      animation: loader-grow 1.2s ease-in-out infinite;
      z-index: 90;
      transition: opacity 220ms ease;
    }
    .top-loader.done { opacity: 0; }
    .page-loader {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      gap: 10px;
      background: rgba(6, 6, 10, 0.88);
      backdrop-filter: blur(5px);
      z-index: 95;
      transition: opacity 220ms ease, visibility 220ms ease;
    }
    .page-loader.hide {
      opacity: 0;
      visibility: hidden;
    }
    .loader-ring {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      border: 3px solid rgba(255, 255, 255, 0.14);
      border-top-color: var(--pink-soft);
      animation: spin 0.8s linear infinite;
    }
    .page-loader p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .notif-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .notif-badge {
      min-width: 22px;
      height: 22px;
      padding: 0 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      background: linear-gradient(135deg, #ff4d8d, #d42c6f);
      border: 1px solid rgba(255,255,255,0.15);
    }
    .inbox-list {
      display: grid;
      gap: 10px;
    }
    .inbox-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.03);
    }
    .inbox-item strong {
      display: block;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .inbox-item p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes loader-grow {
      0% { transform: scaleX(0.05); opacity: 0.5; }
      50% { transform: scaleX(0.8); opacity: 1; }
      100% { transform: scaleX(0.05); opacity: 0.5; }
    }
    @media (max-width: 1080px) {
      .shell, .stack { grid-template-columns: 1fr; }
      .sidebar { position: static; }
    }
    @media (max-width: 760px) {
      .split, .profile-card { grid-template-columns: 1fr; }
      .shell { width: min(100vw - 18px, 1400px); margin: 10px auto; }
      .sidebar, .panel, .metric, .login-card, .hero { padding: 18px; }
      .profile-gallery {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .profile-gallery img {
        height: 90px;
      }
    }
  </style>
</head>
<body>
${req?.session?.user ? `<div class="top-loader" id="top-loader"></div>
<div class="page-loader" id="page-loader"><div class="loader-ring"></div><p>Cargando panel</p></div>
<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <small>Private System</small>
      <strong>Æ beneficio mutuo 🇵🇪</strong>
      <p>Panel oscuro y ordenado para ciudades, perfiles y pagos del bot.</p>
    </div>
    <nav class="nav">
      <a href="/">Principal</a>
      <a href="/config">Ciudades</a>
      <a href="/profiles">Nuevo perfil</a>
      <a href="/profiles/saved">Perfiles guardados</a>
      <a href="/payments">Pagos</a>
      <a href="/notifications" class="notif-link"><span>🔔 Notificaciones</span>${notificationsBadge}</a>
    </nav>
    <form method="post" action="/logout">
      <button type="submit">Cerrar sesion</button>
    </form>
  </aside>
  <main class="main">${content}</main>
</div>` : `<div class="login-wrap">${content}</div>`}
${defaultScript}
${pageScript}
</body>
</html>`;
}

function renderLogin(errorMessage) {
    const content = `<section class="login-card">
      <div class="pill">Acceso restringido</div>
      <h1>Æ beneficio mutuo 🇵🇪</h1>
      <p>Ingresa para gestionar perfiles, ciudades y pagos del bot.</p>
      ${errorMessage ? `<p style="color:#ff9dbc;">${esc(errorMessage)}</p>` : ""}
      <form method="post" action="/login">
        <label class="meta">Usuario</label>
        <input name="username" placeholder="Usuario" required />
        <label class="meta">Contrasena</label>
        <input name="password" placeholder="Contrasena" type="password" required />
        <button type="submit">Entrar al panel</button>
      </form>
    </section>`;
    return shell("Login", content, null);
}

function buildOverview(req) {
    const cities = storage.listCities();
    const profiles = storage.listProfiles();
    const payments = storage.getPayments().payments || [];
    const pending = payments.filter((item) => item.status === "pending").length;
    const available = profiles.filter((item) => item.available !== false).length;
    const content = `
      <section class="hero panel">
        <div class="pill">Dark control room</div>
        <h1>Panel hecho por @crissposs</h1>
        <p>Sube perfiles, ordena zonas y revisa pagos desde una vista compacta.</p>
      </section>
      <section class="metrics">
        <article class="metric"><small>Ciudades</small><strong>${cities.length}</strong></article>
        <article class="metric"><small>Perfiles</small><strong>${profiles.length}</strong></article>
        <article class="metric"><small>Disponibles</small><strong>${available}</strong></article>
        <article class="metric"><small>Pendientes</small><strong>${pending}</strong></article>
      </section>
      <section class="stack">
        <article class="panel">
          <div class="toolbar">
            <div class="toolbar-copy">
              <h2>Arranque rapido</h2>
              <p>Comandos rapidos para levantar todo.</p>
            </div>
          </div>
          <div class="cluster">
            <div class="empty">Bot: <code>ENABLE_GIRLSONLY=1 ADMIN_CHAT_ID=7823152233 npm start</code></div>
            <div class="empty">Web: <code>cd web && npm start</code></div>
          </div>
        </article>
        <article class="panel">
          <div class="toolbar">
            <div class="toolbar-copy">
              <h2>Ciudades activas</h2>
              <p>Resumen corto del mapa.</p>
            </div>
          </div>
          <div class="cards-grid">
            ${cities.map((city) => `<div class="mini-card"><h3>${esc(city.name)}</h3><p>${(city.provinces || []).length} provincias activas.</p></div>`).join("") || '<div class="empty">Sin ciudades aun</div>'}
          </div>
        </article>
      </section>`;
    return shell("Resumen", content, req);
}

function buildConfigPage(req) {
    const config = storage.getConfig();
    const citiesHtml = (config.cities || []).map((city) => `
      <article class="city-card">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>${esc(city.name)}</h2>
            <p>Distritos y provincias visibles en el bot.</p>
          </div>
          <div class="pill-row">
            <span class="pill">${(city.provinces || []).length} provincias</span>
          </div>
        </div>
        <div class="pill-row">
          ${(city.provinces || []).map((province) => `<span class="pill">${esc(province.name)}</span>`).join("") || '<span class="pill">Sin provincias</span>'}
        </div>
      </article>`).join("") || '<div class="empty">Todavia no has creado ciudades.</div>';

    const content = `
      <section class="hero panel">
        <div class="pill">Zonas del bot</div>
        <h1>Ciudades y provincias</h1>
        <p>Mapa limpio de ciudades y provincias ya configuradas.</p>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>Mapa actual</h2>
            <p>Visual de referencia sin formularios para mantenerlo limpio.</p>
          </div>
          <div class="pill-row"><span class="pill">${(config.cities || []).length} ciudades</span></div>
        </div>
        <div class="list">${citiesHtml}</div>
      </section>`;
    return shell("Configuracion", content, req);
}

function buildProfilesPage(req) {
    const config = storage.getConfig();
    const profiles = storage.listProfiles();
    const cities = config.cities || [];
    const cityOptions = cities.map((city) => `<option value="${esc(city.id)}">${esc(city.name)}</option>`).join("");
    const configScript = JSON.stringify(cities);

    const content = `
      <section class="hero panel">
        <div class="pill">Creacion de perfiles</div>
        <h1>Nuevo perfil</h1>
        <p>Crea perfil, previsualiza texto final y revisa las fotos antes de guardar.</p>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>Formulario de perfil</h2>
            <p>Se guarda con formato de publicación y nacionalidad peruana por defecto.</p>
          </div>
          <div class="pill-row"><span class="pill">${profiles.length} perfiles guardados</span></div>
        </div>
        <form class="form-grid" method="post" action="/profiles" enctype="multipart/form-data">
            <div>
              <label class="meta">Nombre</label>
              <input name="name" placeholder="Carla Gonzales" required />
            </div>
            <div>
              <label class="meta">Precio</label>
              <input name="price" placeholder="100" />
            </div>
            <div>
              <label class="meta">Aplicacion</label>
              <select name="source">
                <option value="">Selecciona aplicacion</option>
                <option value="glambu">Glambu</option>
                <option value="seeking">Seeking</option>
              </select>
              <div class="source-legend">
                <span class="source-badge"><img src="https://i.ibb.co/7JxsVkkC/unnamed.jpg" alt="Glambu" /><span>Glambu</span></span>
                <span class="source-badge"><img src="https://i.ibb.co/j9v1YjJC/images.png" alt="Seeking" /><span>Seeking</span></span>
              </div>
            </div>
            <div class="split">
              <div>
                <label class="meta">Ciudad</label>
                <select name="cityId" id="cityId" required>
                  <option value="">Selecciona ciudad</option>
                  ${cityOptions}
                </select>
              </div>
              <div>
                <label class="meta">Provincia</label>
                <select name="provinceId" id="provinceId" required>
                  <option value="">Selecciona provincia</option>
                </select>
              </div>
            </div>
            <p class="hint">El ID de provincia ya no se escribe a mano. Se toma automaticamente de la provincia real que elijas.</p>
            <div>
              <label class="meta">Velitas</label>
              <input name="velitas" placeholder="18" />
            </div>
            <div class="split">
              <div>
                <label class="meta">Nombre de contacto</label>
                <input name="contactName" placeholder="Carla" />
              </div>
              <div>
                <label class="meta">Telefono</label>
                <input name="contactPhone" placeholder="999 999 999" />
              </div>
            </div>
            <div>
              <label class="meta">Fotos (maximo 10)</label>
              <input type="file" name="photos" accept="image/*" multiple />
              <p class="hint">Puedes subir hasta 10 imagenes por perfil (5MB max por archivo, JPG/PNG/WEBP).</p>
              <div id="preview-images" class="preview-gallery"></div>
            </div>
            <div>
              <label class="meta">Vista previa del perfil</label>
              <div id="profile-preview"></div>
            </div>
            <button type="submit">Guardar perfil en el bot</button>
        </form>
      </section>`;

    const pageScript = `<script>
      const cities = ${configScript};
      const citySelect = document.getElementById('cityId');
      const provinceSelect = document.getElementById('provinceId');
      const photosInput = document.querySelector('input[name="photos"]');
      const nameInput = document.querySelector('input[name="name"]');
      const velitasInput = document.querySelector('input[name="velitas"]');
      const contactNameInput = document.querySelector('input[name="contactName"]');
      const contactPhoneInput = document.querySelector('input[name="contactPhone"]');
      const priceInput = document.querySelector('input[name="price"]');
      const sourceSelect = document.querySelector('select[name="source"]');
      const preview = document.getElementById('profile-preview');
      const previewImages = document.getElementById('preview-images');
      function escHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderPreview() {
        if (!preview) return;
        const cityText = citySelect?.options[citySelect.selectedIndex]?.text || '';
        const provinceText = provinceSelect?.options[provinceSelect.selectedIndex]?.text || '';
        const zone = cityText && provinceText ? cityText + ' - ' + provinceText : '-';
        const contactParts = [contactNameInput?.value || '', contactPhoneInput?.value || ''].filter(Boolean);
        const contact = contactParts.length ? contactParts.join(' · ') : '-';
        const sourceText = sourceSelect?.options[sourceSelect.selectedIndex]?.text || 'Sin dato';
        preview.innerHTML =
          '<div class="profile-template">' +
          '<p>||Æ beneficio mutuo 🇵🇪||</p>' +
          '<p>╭━━━━━━━━━━━⪨</p>' +
          '<p>┊🙍‍♀️ <strong>Nombre</strong> : ' + escHtml(nameInput?.value || '') + '</p>' +
          '<p>╰━━━━━━━━━━━⪨</p>' +
          '<p>┊📌 <strong>Zona</strong> : ' + escHtml(zone) + '</p>' +
          '<p>┊📱 <strong>Aplicacion</strong> : ' + escHtml(sourceText === 'Selecciona aplicacion' ? 'Sin dato' : sourceText) + '</p>' +
          '<p>┊🎂 <strong>Velitas</strong> : ' + escHtml(velitasInput?.value || '') + '</p>' +
          '<p>┊💗 <strong>Contacto</strong> : ' + escHtml(contact) + '</p>' +
          '<p>┊━━━━━━━━━━━⪨</p>' +
          '<p>┊💵 <strong>Precio</strong> : ' + escHtml(priceInput?.value || '') + '</p>' +
          '<p>╰━━━━━━━━━━━⪨</p>' +
          '<p>||Æ beneficio mutuo 🇵🇪||</p>' +
          '</div>';
      }

      function renderProvinces() {
        if (!citySelect || !provinceSelect) return;
        const city = cities.find((item) => item.id === citySelect.value);
        const provinces = city ? (city.provinces || []) : [];
        provinceSelect.innerHTML = '<option value="">Selecciona provincia</option>' + provinces.map((province) => '<option value="' + province.id + '">' + province.name + '</option>').join('');
        renderPreview();
      }
      if (citySelect && provinceSelect) {
        citySelect.addEventListener('change', renderProvinces);
        provinceSelect.addEventListener('change', renderPreview);
        renderProvinces();
      }
      [nameInput, velitasInput, contactNameInput, contactPhoneInput, priceInput].forEach(function (input) {
        if (input) input.addEventListener('input', renderPreview);
      });
      if (sourceSelect) {
        sourceSelect.addEventListener('change', renderPreview);
      }
      renderPreview();
      if (photosInput) {
        photosInput.addEventListener('change', function () {
          if (this.files && this.files.length > 10) {
            alert('Solo se permiten 10 fotos como maximo.');
            this.value = '';
            if (previewImages) previewImages.innerHTML = '';
            return;
          }
          if (!previewImages) return;
          const files = Array.from(this.files || []);
          previewImages.innerHTML = files.map(function (file, index) {
            const url = URL.createObjectURL(file);
            return '<img src="' + url + '" alt="preview-' + index + '" />';
          }).join('');
        });
      }
    </script>`;

    return shell("Perfiles", content, req, pageScript);
}

function buildSavedProfilesPage(req) {
    const profiles = storage.listProfiles();
    const cards = profiles.map((profile) => {
        const profilePhotos = normalizeProfilePhotoPaths(profile);
        const galleryClass = profilePhotos.length <= 1 ? "profile-gallery main-only" : "profile-gallery";
        const galleryHtml = profilePhotos.length
            ? profilePhotos.map((photo) => `<img src="${esc(assetUrl(photo, "/models"))}" alt="${esc(profile.name)}" />`).join("")
            : '<div class="empty" style="height:190px; display:grid; place-items:center;">Sin foto</div>';
        const sourceMeta = getSourceMeta(profile.source);
        const templateHtml = buildProfileTemplateHtml(profile);
        return `
      <article class="profile-card">
        <div class="${galleryClass}">
          ${galleryHtml}
        </div>
        <div>
          <h3>${esc(profile.name)}</h3>
          <div class="muted" style="margin-bottom:12px;">${esc(profileLocation(profile))}</div>
          <div class="pill-row">
            <span class="pill">${esc(profile.nationality || "Peruana 🇵🇪")}</span>
            <span class="pill">Velitas: ${esc(profile.velitas || "-")}</span>
            <span class="pill">Precio: ${esc(profile.price || "-")}</span>
            <span class="source-badge">${sourceMeta.logo ? `<img src="${esc(sourceMeta.logo)}" alt="${esc(sourceMeta.label)}" />` : ""}<span>Aplicacion: ${esc(sourceMeta.label)}</span></span>
            <span class="pill">Fotos: ${profilePhotos.length}</span>
          </div>
          ${templateHtml}
          <div class="actions">
            <form method="post" action="/profiles/${encodeURIComponent(profile.id)}/photos" enctype="multipart/form-data">
              <input type="file" name="photos" accept="image/*" multiple />
              <button type="submit">Agregar fotos</button>
            </form>
            <form method="post" action="/profiles/${encodeURIComponent(profile.id)}/delete"><button class="danger" type="submit">Eliminar perfil</button></form>
          </div>
        </div>
      </article>`;
    }).join("") || '<div class="empty">Aun no hay perfiles cargados.</div>';

    const content = `
      <section class="hero panel">
        <div class="pill">Catalogo publicado</div>
        <h1>Perfiles guardados</h1>
        <p>Vista ordenada y sin distorsion en imagenes.</p>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>Listado completo</h2>
            <p>Perfiles listos para mostrarse en el bot.</p>
          </div>
          <div class="pill-row"><span class="pill">${profiles.length} perfiles</span></div>
        </div>
        <div class="profiles-list">${cards}</div>
      </section>`;
    return shell("Perfiles guardados", content, req);
}

function buildPaymentsPage(req) {
    const payments = storage.getPayments().payments || [];
    const pendingPayments = payments.filter((payment) => payment.status === "pending");
    const historyPayments = payments.filter((payment) => payment.status !== "pending");
    const renderCard = (payment, includeActions) => {
        const isVipPayment = payment.paymentType === "vip" || payment.profileId === "vip-pass";
        return `
      <article class="payment-card">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>${esc(payment.profileName || payment.profileId)}</h2>
            <p>paymentId: ${esc(payment.id)} · chat.id: ${esc(payment.chatId)} · ${esc(formatDateTime(payment.createdAt))}</p>
          </div>
          <div class="pill-row">
            <span class="pill">${esc(payment.status)}</span>
            <span class="pill">${esc(payment.paymentMethod)}</span>
            <span class="pill">${esc(isVipPayment ? "vip" : "contacto")}</span>
            <span class="pill">from.id ${esc(payment.userId)}</span>
          </div>
        </div>
        <div class="stack single" style="gap:18px;">
          <div class="payment-media">
            ${payment.proofPath ? `<img src="${esc(assetUrl(payment.proofPath, "/captures"))}" alt="captura" />` : '<div class="empty">Sin captura</div>'}
          </div>
          <div class="actions">
            ${includeActions ? `
            ${isVipPayment
                ? `<form method="post" action="/payments/${encodeURIComponent(payment.id)}/vip-add"><button type="submit">Enviar link y boleta</button></form>`
                : `<form method="post" action="/payments/${encodeURIComponent(payment.id)}/approve"><button type="submit">Aprobar y enviar contacto + boleta PDF</button></form>`
            }
            <form method="post" action="/payments/${encodeURIComponent(payment.id)}/reject">
              <input name="reason" placeholder="Motivo de rechazo" />
              <button class="danger" type="submit">Rechazar pago</button>
            </form>
            <form method="post" action="/payments/${encodeURIComponent(payment.id)}/refund">
              <input name="reason" placeholder="Motivo de reembolso" />
              <button class="ghost" type="submit">Reembolsar pago</button>
            </form>` : ""}
            <form method="post" action="/payments/${encodeURIComponent(payment.id)}/delete"><button class="danger" type="submit">Eliminar pago</button></form>
          </div>
        </div>
      </article>`;
    };

    const pendingCards = pendingPayments.map((payment) => renderCard(payment, true)).join("") || '<div class="empty">No hay pagos pendientes.</div>';
    const historyCards = historyPayments.map((payment) => renderCard(payment, false)).join("") || '<div class="empty">No hay historial todavia.</div>';

    const content = `
      <section class="hero panel">
        <div class="pill">Verificacion manual</div>
        <h1>Pagos y capturas</h1>
        <p>Aprueba o rechaza pagos desde una vista mas directa.</p>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>Pagos recibidos</h2>
            <p>Comprobantes pendientes de revision.</p>
          </div>
          <div class="pill-row">
            <span class="pill">${payments.length} pagos</span>
            <span class="pill">${pendingPayments.length} pendientes</span>
            <span class="pill">${historyPayments.length} historial</span>
          </div>
        </div>
        <h3 class="section-title">Pendientes</h3>
        <div class="list">${pendingCards}</div>
        <h3 class="section-title">Historial</h3>
        <div class="list">${historyCards}</div>
      </section>`;
    return shell("Pagos", content, req);
}

function buildNotificationsPage(req) {
    const notifications = getNotificationsData();
    const listHtml = notifications.items.map((item) => (
        `<article class="mini-card">
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.subtitle)}</p>
          <p class="muted">${esc(formatDateTime(item.createdAt))}</p>
        </article>`
    )).join("") || '<div class="empty">No hay notificaciones pendientes en este momento.</div>';

    const content = `
      <section class="hero panel">
        <div class="pill">Centro de alertas</div>
        <h1>🔔 Notificaciones</h1>
        <p>Buzon de actividad en tiempo real del panel.</p>
      </section>
      <section class="panel">
        <div class="toolbar">
          <div class="toolbar-copy">
            <h2>Bandeja</h2>
            <p>Aqui veras pagos nuevos y acciones pendientes.</p>
          </div>
          <div class="pill-row"><span class="pill">${notifications.unreadCount} pendientes</span></div>
        </div>
        <div class="cards-grid">${listHtml}</div>
      </section>`;
    return shell("Notificaciones", content, req);
}

app.get("/login", (req, res) => {
    res.send(renderLogin(""));
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username] === password) {
        req.session.user = username;
        res.redirect("/");
        return;
    }
    res.status(401).send(renderLogin("Credenciales invalidas."));
});

app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

app.get("/health", (req, res) => {
    res.status(200).send("ok");
});

app.get("/", requireAuth, (req, res) => {
    res.send(buildMainPage(req));
});

app.get("/config", requireAuth, (req, res) => {
    res.send(buildConfigPage(req));
});

app.post("/config/cities", requireAuth, (req, res) => {
    if (req.body.name?.trim()) {
        storage.upsertCity(req.body.name.trim());
    }
    res.redirect("/config");
});

app.post("/config/cities/:cityId/delete", requireAuth, (req, res) => {
    storage.removeCity(req.params.cityId);
    res.redirect("/config");
});

app.post("/config/cities/:cityId/provinces", requireAuth, (req, res) => {
    if (req.body.name?.trim()) {
        storage.upsertProvince(req.params.cityId, req.body.name.trim());
    }
    res.redirect("/config");
});

app.post("/config/cities/:cityId/provinces/:provinceId/delete", requireAuth, (req, res) => {
    storage.removeProvince(req.params.cityId, req.params.provinceId);
    res.redirect("/config");
});

app.post("/config/import-city-districts", requireAuth, (req, res) => {
    storage.mergeCityCatalog(PERU_CITY_DISTRICTS);
    res.redirect("/config");
});

app.get("/profiles", requireAuth, (req, res) => {
    res.send(buildProfilesPage(req));
});

app.get("/profiles/saved", requireAuth, (req, res) => {
    res.send(buildSavedProfilesPage(req));
});

app.post("/profiles", requireAuth, upload.array("photos", 10), (req, res) => {
    const cityId = req.body.cityId?.trim();
    const provinceId = req.body.provinceId?.trim();
    const city = storage.getCity(cityId);
    const province = storage.getProvince(cityId, provinceId);

    if (!city || !province || !req.body.name?.trim()) {
        res.redirect("/profiles");
        return;
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const photoPaths = files
        .map((file) => path.join("models", path.basename(file.path)))
        .slice(0, MAX_PROFILE_PHOTOS);
    storage.saveProfile({
        id: storage.makeId("profile"),
        name: req.body.name.trim(),
        nationality: "Peruana 🇵🇪",
        cityId: city.id,
        cityName: city.name,
        provinceId: province.id,
        provinceName: province.name,
        locationLabel: `${city.name} - ${province.name}`,
        velitas: req.body.velitas?.trim() || "",
        gustos: "",
        price: req.body.price?.trim() || "",
        description: "",
        source: req.body.source?.trim() || "",
        vip: false,
        available: true,
        photoPaths,
        contactName: req.body.contactName?.trim() || "",
        contactPhone: req.body.contactPhone?.trim() || "",
        contactTelegram: ""
    });

    res.redirect("/profiles");
});

app.post("/profiles/:profileId/toggle", requireAuth, (req, res) => {
    const profile = storage.getProfile(req.params.profileId);
    if (profile) {
        storage.saveProfile({
            ...profile,
            available: profile.available === false
        });
    }
    res.redirect("/profiles");
});

app.post("/profiles/:profileId/photos", requireAuth, upload.array("photos", 10), (req, res) => {
    const profile = storage.getProfile(req.params.profileId);
    if (!profile) {
        res.redirect("/profiles/saved");
        return;
    }

    const existingPhotoPaths = Array.isArray(profile.photoPaths)
        ? profile.photoPaths.filter(Boolean)
        : (profile.photoPath ? [profile.photoPath] : []);
    const files = Array.isArray(req.files) ? req.files : [];
    const incomingPhotoPaths = files.map((file) => path.join("models", path.basename(file.path)));

    storage.saveProfile({
        ...profile,
        photoPaths: [...existingPhotoPaths, ...incomingPhotoPaths].slice(0, MAX_PROFILE_PHOTOS)
    });

    res.redirect("/profiles/saved");
});

app.post("/profiles/:profileId/delete", requireAuth, (req, res) => {
    storage.removeProfile(req.params.profileId);
    res.redirect("/profiles");
});

app.get("/payments", requireAuth, (req, res) => {
    res.send(buildPaymentsPage(req));
});

app.get("/notifications", requireAuth, (req, res) => {
    res.send(buildNotificationsPage(req));
});

app.post("/payments/:paymentId/approve", requireAuth, (req, res) => {
    storage.updatePayment(req.params.paymentId, { status: "approved_pending_delivery" });
    storage.enqueueApproval({
        paymentId: req.params.paymentId,
        action: "approve_contact",
        approvedBy: req.session.user
    });
    res.redirect("/payments");
});

app.post("/payments/:paymentId/vip-add", requireAuth, (req, res) => {
    storage.updatePayment(req.params.paymentId, { status: "vip_pending_add" });
    storage.enqueueApproval({
        paymentId: req.params.paymentId,
        action: "approve_vip_add",
        approvedBy: req.session.user
    });
    res.redirect("/payments");
});

app.post("/payments/:paymentId/reject", requireAuth, (req, res) => {
    storage.updatePayment(req.params.paymentId, { status: "rejected_pending_delivery" });
    storage.enqueueApproval({
        paymentId: req.params.paymentId,
        action: "reject",
        reason: req.body.reason?.trim() || "",
        approvedBy: req.session.user
    });
    res.redirect("/payments");
});

app.post("/payments/:paymentId/refund", requireAuth, (req, res) => {
    storage.updatePayment(req.params.paymentId, { status: "refunded_pending_delivery" });
    storage.enqueueApproval({
        paymentId: req.params.paymentId,
        action: "refund",
        reason: req.body.reason?.trim() || "",
        approvedBy: req.session.user
    });
    res.redirect("/payments");
});

app.post("/payments/:paymentId/delete", requireAuth, (req, res) => {
    const removedPayment = storage.removePayment(req.params.paymentId);
    if (removedPayment?.proofPath) {
        const proofPath = path.isAbsolute(removedPayment.proofPath)
            ? removedPayment.proofPath
            : path.join(process.cwd(), removedPayment.proofPath);
        if (fs.existsSync(proofPath)) {
            fs.unlinkSync(proofPath);
        }
    }
    res.redirect("/payments");
});

app.use((error, req, res, next) => {
    if (!error) {
        next();
        return;
    }

    if (error instanceof multer.MulterError || /JPG, PNG o WEBP/.test(String(error.message || ""))) {
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Cada foto debe pesar maximo 5MB."
            : error.code === "LIMIT_FILE_COUNT"
                ? "Solo se permiten 10 fotos por perfil."
                : (error.message || "No se pudieron subir las fotos.");
        const target = req.path.includes("/profiles/saved") ? "/profiles/saved" : "/profiles";
        res.status(400).send(shell(
            "Error de subida",
            `<section class="panel"><h2>Error</h2><p class="lead">${esc(message)}</p><p class="lead">Vuelve a intentarlo desde <a href="${esc(target)}"><code>${esc(target)}</code></a>.</p></section>`,
            req
        ));
        return;
    }

    next(error);
});

const server = app.listen(PORT, () => {
    fs.mkdirSync(storage.MODELS_DIR, { recursive: true });
    console.log(`GirlsOnly web admin escuchando en http://localhost:${PORT}`);
    startBot().catch((error) => {
        console.error(`No se pudo iniciar el bot: ${error?.stack || error}`);
    });
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`Recibido ${signal}, cerrando web y bot...`);

    await Promise.allSettled([
        new Promise((resolve) => {
            server.close(() => resolve());
        }),
        stopBot(signal)
    ]);

    process.exit(0);
}

process.on("SIGINT", () => {
    shutdown("SIGINT");
});

process.on("SIGTERM", () => {
    shutdown("SIGTERM");
});

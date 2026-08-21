const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      pais TEXT,
      region TEXT,
      comuna TEXT,
      procedencia TEXT,
      informador TEXT,
      femenino INTEGER NOT NULL DEFAULT 0,
      masculino INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      edad_menor18 INTEGER NOT NULL DEFAULT 0,
      edad_18_29 INTEGER NOT NULL DEFAULT 0,
      edad_30_40 INTEGER NOT NULL DEFAULT 0,
      edad_41_50 INTEGER NOT NULL DEFAULT 0,
      edad_mayor50 INTEGER NOT NULL DEFAULT 0,
      motivo TEXT,
      atractivos JSONB NOT NULL DEFAULT '[]',
      servicios JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_options (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('atractivo','servicio')),
      value TEXT NOT NULL,
      UNIQUE(kind, value)
    );
  `);
}

function rowToRecord(row) {
  return {
    id: String(row.id),
    fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha,
    pais: row.pais || "",
    region: row.region || "",
    comuna: row.comuna || "",
    procedencia: row.procedencia || "",
    informador: row.informador || "",
    femenino: row.femenino,
    masculino: row.masculino,
    total: row.total,
    edad_menor18: row.edad_menor18,
    edad_18_29: row.edad_18_29,
    edad_30_40: row.edad_30_40,
    edad_41_50: row.edad_41_50,
    edad_mayor50: row.edad_mayor50,
    motivo: row.motivo || "",
    atractivos: row.atractivos || [],
    servicios: row.servicios || [],
  };
}

// ---------------------------------------------------------------------------
// Acceso
//
// La clave vive SOLO en el servidor (variable de entorno). El navegador nunca
// la guarda: recibe una cookie firmada. Es la diferencia entre cerrar la API y
// aparentar que se cerró — un token incrustado en el JS del front lo puede leer
// cualquiera que abra el código de la página.
// ---------------------------------------------------------------------------
const CLAVE = process.env.APP_CLAVE;
if (!CLAVE) {
  // Falla cerrado a propósito: sin clave configurada NO se levanta la API.
  // Arrancar "abierto por defecto" es justo como estuvo esto hasta hoy.
  console.error("FALTA la variable APP_CLAVE. El servidor no arranca sin clave de acceso.");
  process.exit(1);
}

const COOKIE = "rt_sesion";
const DURACION_MS = 180 * 24 * 60 * 60 * 1000;   // 6 meses: se escribe una vez por dispositivo

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest();

function firmar(exp) {
  return crypto.createHmac("sha256", CLAVE).update(String(exp)).digest("base64url");
}

function crearToken() {
  const exp = Date.now() + DURACION_MS;
  return exp + "." + firmar(exp);
}

function tokenValido(t) {
  if (!t) return false;
  const corte = t.indexOf(".");
  if (corte < 0) return false;
  const exp = t.slice(0, corte);
  const firma = t.slice(corte + 1);
  if (!/^[0-9]{1,15}$/.test(exp) || Number(exp) < Date.now()) return false;
  const a = Buffer.from(firma);
  const b = Buffer.from(firmar(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function leerCookie(req, nombre) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const parte of raw.split(";")) {
    const trozo = parte.trim();
    const igual = trozo.indexOf("=");
    if (igual > 0 && trozo.slice(0, igual) === nombre) {
      return decodeURIComponent(trozo.slice(igual + 1));
    }
  }
  return null;
}

function esHttps(req) {
  return req.secure || req.get("x-forwarded-proto") === "https";
}

// Freno a la fuerza bruta. Se cuenta por IP y TAMBIÉN en total: en SIC-PRO el
// ataque vino repartido entre muchas IP, y un límite por IP solo no lo habría
// visto.
// Los informadores comparten el WiFi de la municipalidad, así que comparten IP:
// un tope bajo los bloquearía entre ellos. 15 intentos no le sirven de nada a
// quien quiera adivinar una clave larga.
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_IP = 15;
// El tope global corta un ataque repartido entre muchas IP, pero si es muy bajo
// el atacante puede dejar fuera al equipo real solo con fallar. Se deja alto.
const MAX_GLOBAL = 300;
const intentosPorIp = new Map();
let fallosGlobales = 0;
let ventanaGlobal = Date.now() + VENTANA_MS;

function registrarFallo(ip) {
  const ahora = Date.now();
  if (ahora > ventanaGlobal) { fallosGlobales = 0; ventanaGlobal = ahora + VENTANA_MS; }
  fallosGlobales++;
  const previo = intentosPorIp.get(ip);
  if (!previo || ahora > previo.hasta) intentosPorIp.set(ip, { n: 1, hasta: ahora + VENTANA_MS });
  else previo.n++;
  // Limpieza para que el Map no crezca sin control.
  if (intentosPorIp.size > 5000) {
    for (const [k, v] of intentosPorIp) if (ahora > v.hasta) intentosPorIp.delete(k);
  }
}

function frenado(ip) {
  const ahora = Date.now();
  if (ahora <= ventanaGlobal && fallosGlobales >= MAX_GLOBAL) return true;
  const previo = intentosPorIp.get(ip);
  return !!(previo && ahora <= previo.hasta && previo.n >= MAX_POR_IP);
}

// Cabeceras de seguridad (antes no había ninguna: la app se podía embeber en un
// iframe ajeno). 'unsafe-inline' en estilos es necesario porque las barras del
// Panel llevan su ancho en el atributo style.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'");
  if (esHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=15552000");
  next();
});

// Estado de sesión: público a propósito, es lo que le permite al front saber si
// tiene que pedir la clave. No revela nada más.
app.get("/api/sesion", (req, res) => {
  res.json({ api: true, autenticado: tokenValido(leerCookie(req, COOKIE)) });
});

app.post("/api/login", (req, res) => {
  const ip = req.ip || "?";
  if (frenado(ip)) return res.status(429).json({ error: "demasiados_intentos" });
  const entrada = (req.body && req.body.clave) || "";
  if (!crypto.timingSafeEqual(sha256(entrada), sha256(CLAVE))) {
    registrarFallo(ip);
    return res.status(401).json({ error: "clave_incorrecta" });
  }
  res.setHeader("Set-Cookie",
    COOKIE + "=" + crearToken() +
    "; Path=/; Max-Age=" + Math.floor(DURACION_MS / 1000) +
    "; HttpOnly; SameSite=Lax" + (esHttps(req) ? "; Secure" : ""));
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", COOKIE + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (esHttps(req) ? "; Secure" : ""));
  res.json({ ok: true });
});

// Todo lo demás bajo /api exige sesión.
app.use("/api", (req, res, next) => {
  if (tokenValido(leerCookie(req, COOKIE))) return next();
  res.status(401).json({ error: "no_autorizado" });
});

app.get("/api/records", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM records ORDER BY fecha DESC, id DESC LIMIT 20000");
    res.json({ records: rows.map(rowToRecord) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    const r = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO records
        (fecha, pais, region, comuna, procedencia, informador, femenino, masculino, total,
         edad_menor18, edad_18_29, edad_30_40, edad_41_50, edad_mayor50, motivo, atractivos, servicios)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        r.fecha, r.pais || "", r.region || "", r.comuna || "", r.procedencia || "", r.informador || "",
        r.femenino || 0, r.masculino || 0, r.total || 0,
        r.edad_menor18 || 0, r.edad_18_29 || 0, r.edad_30_40 || 0, r.edad_41_50 || 0, r.edad_mayor50 || 0,
        r.motivo || "", JSON.stringify(r.atractivos || []), JSON.stringify(r.servicios || []),
      ]
    );
    res.json({ record: rowToRecord(rows[0]) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

app.delete("/api/records/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM records WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

app.get("/api/custom", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT kind, value FROM custom_options ORDER BY id ASC");
    res.json({
      atractivosCustom: rows.filter(r => r.kind === "atractivo").map(r => r.value),
      serviciosCustom: rows.filter(r => r.kind === "servicio").map(r => r.value),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

app.post("/api/custom", async (req, res) => {
  try {
    const { kind, value } = req.body || {};
    if (!kind || !value || !["atractivo", "servicio"].includes(kind)) {
      return res.status(400).json({ error: "invalid_input" });
    }
    await pool.query(
      "INSERT INTO custom_options (kind, value) VALUES ($1,$2) ON CONFLICT (kind, value) DO NOTHING",
      [kind, value]
    );
    const { rows } = await pool.query("SELECT kind, value FROM custom_options ORDER BY id ASC");
    res.json({
      atractivosCustom: rows.filter(r => r.kind === "atractivo").map(r => r.value),
      serviciosCustom: rows.filter(r => r.kind === "servicio").map(r => r.value),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Bulk import — used once to migrate records already captured on encuestadores' phones (localStorage) into the shared DB.
app.post("/api/import", async (req, res) => {
  try {
    const records = (req.body && req.body.records) || [];
    let inserted = 0;
    for (const r of records) {
      await pool.query(
        `INSERT INTO records
          (fecha, pais, region, comuna, procedencia, informador, femenino, masculino, total,
           edad_menor18, edad_18_29, edad_30_40, edad_41_50, edad_mayor50, motivo, atractivos, servicios)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          r.fecha, r.pais || "", r.region || "", r.comuna || "", r.procedencia || "", r.informador || "",
          r.femenino || 0, r.masculino || 0, r.total || 0,
          r.edad_menor18 || 0, r.edad_18_29 || 0, r.edad_30_40 || 0, r.edad_41_50 || 0, r.edad_mayor50 || 0,
          r.motivo || "", JSON.stringify(r.atractivos || []), JSON.stringify(r.servicios || []),
        ]
      );
      inserted++;
    }
    res.json({ ok: true, inserted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "db_error" });
  }
});

// Solo se publica public/. Antes se servía __dirname entero, así que quedaban
// accesibles desde internet server.js, package.json, README.md, tools/ y —lo
// peor— docs/, que incluye la lista de vulnerabilidades abiertas de esta misma
// app y el SQL de limpieza de la base. (CN-005 de la auditoría del 2026-08-21.)
const PUBLICO = path.join(__dirname, "public");

// El set de datos simulados solo se entrega en desarrollo: son datos ficticios
// y no tienen por qué poder confundirse con registros reales en internet.
app.get("/seed-data.json", (req, res, next) => {
  const h = req.hostname;
  if (h === "localhost" || h === "127.0.0.1") return next();
  res.status(404).end();
});

app.use(express.static(PUBLICO));

const PORT = process.env.PORT || 8090;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Registro de Turistas escuchando en puerto ${PORT}`));
  })
  .catch(e => {
    console.error("No se pudo inicializar la base de datos", e);
    process.exit(1);
  });

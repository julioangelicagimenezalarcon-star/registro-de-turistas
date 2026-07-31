const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
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

app.use(express.static(__dirname));

const PORT = process.env.PORT || 8090;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Registro de Turistas escuchando en puerto ${PORT}`));
  })
  .catch(e => {
    console.error("No se pudo inicializar la base de datos", e);
    process.exit(1);
  });

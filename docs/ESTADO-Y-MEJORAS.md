# Registro de Turistas — Estado y plan de mejoras
_Revisión hecha el 2026-08-21. Última vez que se tocó el proyecto: 2026-07-31._

## 1. Dónde quedamos

- **Código:** rama `main`, último commit `aed71ec` (31-jul-2026), árbol limpio y
  sincronizado con GitHub (`julioangelicagimenezalarcon-star/registro-de-turistas`).
  **Lo que está en el Mac es exactamente lo que está en producción.**
- **Producción:** Railway, cuenta `julioangelicagimenezalarcon@gmail.com`,
  proyecto "Registro de Turistas" (servicios: app + Postgres, ambos `RUNNING`).
  URL: https://registro-de-turistas-production.up.railway.app — verificada hoy,
  carga bien y muestra la pantalla de login.
- **Datos reales:** la base compartida tiene **1 solo registro**, del 31-jul-2026,
  de Angélica. O sea: la app está arriba pero **todavía no se usa en terreno**.
- **Último trabajo hecho (31-jul):** backend compartido (Express + Postgres) para
  que todos los encuestadores vean los mismos registros, librerías Chart.js y
  SheetJS alojadas localmente (se dejó de depender del CDN) y el arreglo del
  crash del Panel en Safari/iOS (colores "scriptable" de Chart.js).
- **Documento de continuación:** no hay un `.md` de traspaso aparte — el traspaso
  está en `README.md` (secciones 7 y 8) y la hoja de ruta comercial está en
  `../Informe-Registro-de-Turistas-2.0.html`, la propuesta "Registro de Turistas
  2.0". Ese informe está **escrito pero sin una línea de código**: quedó esperando
  4 decisiones del cliente (ver sección 4 de este documento).

## 2. Lo que apareció al revisar hoy (no estaba anotado en ninguna parte)

1. **La API está completamente abierta.** `GET/POST/DELETE /api/records`,
   `/api/custom` y `/api/import` no piden nada: cualquier persona con la URL
   puede leer todos los registros, inventar registros o **borrar la base entera**
   desde el navegador. La app nunca pasó por la auditoría `cyber-neo` (regla
   obligatoria antes de exponer algo a internet).
2. **Bomba de tiempo con los datos de demo.** `app.js:1119-1145`: si la base
   compartida queda con **0 registros**, la app importa sola las **932 filas
   simuladas** de `seed-data.json` (dic-2025 a feb-2026) a la base de producción.
   Hoy no se dispara solo porque hay 1 registro. Si alguien borra ese registro,
   la base real queda llena de datos falsos indistinguibles de los verdaderos.
3. **"Eliminar" no pregunta nada.** `app.js:971-985`: un toque en el botón
   Eliminar borra el registro en el servidor, para todos, sin confirmación, sin
   deshacer y sin dejar rastro de quién lo borró.
4. **El login sigue con una sola persona.** `app.js:172` — `PERSONAL` solo tiene
   a "Angélica Alarcón". Falta el listado del resto de los informadores.
5. **No hay respaldo de la base.** Si el Postgres de Railway se cae o se borra,
   no existe copia de los registros en ninguna otra parte.

## 0. DESPLEGADO el 2026-08-21

Se subió a producción (`railway up`, commit `486dfa5`) el gráfico de días de
afluencia, la vista de procedencia por región, el arreglo de la escala, el
cierre del auto-seed y la corrección del XSS. Verificado en producción: el único
registro real (id 936) sigue intacto, no se coló ningún registro simulado y
`seed-data.json` ya no se descarga.

**Segundo despliegue del mismo día — la API quedó cerrada.** Se resolvieron
**CN-001** (clave de acceso + cookie de sesión firmada), **CN-002** (XSS),
**CN-003** (`/api/import` ahora exige sesión) y **CN-006** (cabeceras de
seguridad). Verificado contra producción: `records`, `custom`, `import` y
`delete` responden 401 sin sesión.

⚠️ **`APP_CLAVE` es obligatoria en Railway: sin ella el servidor no arranca.**
Al desplegar, configurar la variable ANTES de subir el código.

**CN-005 también quedó cerrado** (tercer despliegue del día): el servidor solo
publica `public/`. Antes del cambio se verificó contra producción que
`/server.js`, `/package.json`, `/README.md`, `/tools/` y `/docs/` devolvían 200
— incluido este mismo archivo, que lista las vulnerabilidades abiertas de la
app, y el SQL de limpieza de la base.

**Regla para archivos nuevos:** si no tiene que poder bajarlo un desconocido, va
fuera de `public/`.

Siguen abiertos de la auditoría (informe en el Escritorio): **CN-004** (SheetJS
0.18.5 con CVE conocidos, vendorizado, npm audit no lo ve), **CN-007**
(`rejectUnauthorized:false` contra Postgres), **CN-008** (sin rate limit fuera
del login), **CN-009** (sin validación de entrada en el servidor) y **CN-010**
(borrado sin confirmación ni trazabilidad).

**Pendiente aparte:** el `git push` a GitHub falló — el llavero de macOS tiene
una credencial vencida. El commit está solo en local. (Se quitó del
`~/.gitconfig` un credential helper que apuntaba a un `gh` inexistente y rompía
el push en todos los repos; respaldo en `~/.gitconfig.respaldo-2026-08-21`.)

**Para desplegar de nuevo:** la carpeta ya quedó enlazada al proyecto Railway
`3ab72634-81da-4a3f-b502-c27096956c26`. El servicio NO está conectado a GitHub,
así que se sube con `railway up` desde esta carpeta, verificando el ID en la
misma invocación.

## 2 bis. Hecho después de esta revisión

- **[2026-08-21] Gráfico "Días de mayor afluencia"** (pedido de Julio, hecho y
  verificado en local, **sin desplegar**). Barras Lun→Dom con el total de
  turistas — el día peak en dorado — más un ranking de las 5 fechas peak de la
  temporada. Tooltip con promedio por jornada. Archivos tocados: `app.js`
  (`weekdayIndex`, `weekdayStats`, `makeDiaSemanaChart` + la tarjeta en
  `renderPanelContent`), `styles.css` (`.afluencia-body`, `.peak-*`) y
  `README.md` §8. Sin commitear todavía.

- **[2026-08-21] Temporada alta simulada** (pedido de Julio). El seed dejó de
  ser un JSON a mano y pasa a generarse con `tools/generar-seed-temporada.py`,
  determinista. Modela la temporada **dic-2026 → mar-2027**, que es cuando los
  operadores usarán la app: **1.245 registros / 4.703 turistas**, con Año Nuevo
  y la Candelaria como peaks. Reemplaza la simulación anterior, respaldada en
  `tools/seed-data.ANTERIOR.json`. Verificado: 0 errores de invariante, comunas
  todas dentro del catálogo de la app, y los números del Panel calzan con el
  cálculo hecho aparte sobre el JSON. **Solo local, nada cargado a producción.**

- **[2026-08-21] Legibilidad del Panel** (reportado por Julio). Se corrigió la
  escala fija en 100% de los cinco gráficos de barras y Procedencia pasó a tener
  vista **Región ⇄ Comuna**, con el resto declarado como nota en vez de
  recortado. Detalle en `README.md` §8. Sin desplegar.

## 3. Mejoras para trabajar en local (priorizadas)

### A. Antes de que la usen en terreno de verdad (bloqueantes)

- [ ] **A1. Correr `cyber-neo` sobre el proyecto** y cerrar lo que salga.
      Es la regla de la casa y este proyecto nunca la pasó.
- [ ] **A2. Cerrar la API.** Mínimo viable: una clave compartida por informador
      (token en el `sessionStorage` que viaja en cada llamada) y el `DELETE`
      restringido. Ideal: PIN por informador, como en SIC-PRO.
- [ ] **A3. Desactivar el auto-seed en producción.** Que los 932 registros de
      demo solo se carguen con `?seed=1` **y** en local — nunca solos contra la
      base compartida. Es un `if` de 3 líneas.
- [ ] **A4. Confirmación antes de eliminar** + borrado lógico (marcar
      `eliminado_en` en vez de `DELETE`), para poder recuperar un error.
- [ ] **A5. Respaldo automático** de la base (export diario a JSON/CSV, igual
      que `railway-backups` de los otros proyectos).
- [ ] **A6. Cargar el listado completo de informadores** en `PERSONAL`
      (`app.js:172`). Pendiente que la Municipalidad lo entregue.

### B. Para que sirva en terreno (uso real)

- [ ] **B1. Modo sin señal (offline real).** Service worker + cola local: el
      registro se guarda en el teléfono y se sincroniza al recuperar señal. Hoy
      el `manifest.json` la hace *parecer* app instalable, pero sin internet no
      guarda nada. En la costa de Cobquecura esto no es opcional.
- [ ] **B2. Indicador de conexión** visible ("guardado en el servidor" vs.
      "pendiente de sincronizar").
- [ ] **B3. Editar un registro** (hoy solo se puede crear y borrar).
- [ ] **B4. Paginación / buscador en el Historial** (hoy dibuja todos los
      registros de una vez; con una temporada completa se pone lento en celular).
- [ ] **B5. Validación más firme** de sexo/edad contra el total (hoy avisa pero
      deja guardar descuadrado).

### C. Registro de Turistas 2.0 (el informe de propuesta, aún sin construir)

Las 6 recomendaciones del informe, ordenadas como quedaron ahí:

- [ ] **C1. Gasto e impacto económico** (alto impacto) — noches de estadía, gasto
      estimado por grupo, categoría de gasto.
- [ ] **C2. Señales de oportunidad de negocio** (alto impacto) — "¿buscaba algo
      que no encontró?", satisfacción 1-5, ¿recomendaría Cobquecura?
- [ ] **C3. Reportes ejecutivos** (alto impacto) — informe mensual/trimestral
      automático, comparación temporada vs. temporada, mapa de procedencia.
- [ ] **C4. Segmentación de mercado** (medio) — tipo de grupo, canal de
      descubrimiento, primera visita vs. repetida.
- [ ] **C5. Vínculo con negocios reales** (medio) — nombre del negocio, no solo
      categoría; directorio local.
- [ ] **C6. Capacidad de carga** (largo plazo) — indicador por fecha peak.

### D. Mantenimiento / orden

- [ ] **D1. Enlazar la carpeta a Railway** (`railway link`) para que el CLI no
      apunte al proyecto equivocado desde `/Users/julio`. Hoy la carpeta **no**
      está enlazada.
- [ ] **D2. Tests automatizados** — no hay ninguno.
- [ ] **D3. Sacar `seed-data.json` (400 KB) del deploy de producción** o moverlo
      a una carpeta `demo/` que no se publique.
- [ ] **D4. `docs/lecciones.md`** — el proyecto no lo tiene.

## 4. Decisiones del cliente que siguen pendientes (del informe 2.0)

1. ¿Las 6 recomendaciones completas, o partir por las de alto impacto (1, 2 y 4)?
2. "Offline": ¿ambiente de desarrollo separado, formulario sin señal en terreno,
   o las dos cosas?
3. Gasto estimado: ¿monto aproximado o rango (bajo / medio / alto)?
4. ¿Quién puede ver el informe ejecutivo: solo el cliente, el equipo municipal,
   o también un fondo/inversionista externo?

## 5. Cómo trabajar en local

La app es HTML/CSS/JS puro; el backend es un Express chico.

**Opción rápida (solo interfaz, sin base de datos).** Sirve la carpeta y la app
cae sola a `localStorage`, con los 932 registros de demo cargados — perfecto para
ver el Panel con volumen:

```bash
cd ~/tourist-registry-app/tourist-registry-app && python3 -m http.server 8080
```

Luego abrir http://localhost:8080 (no abrir `index.html` con doble clic).

**Opción completa (con backend).** `server.js` necesita `DATABASE_URL`; sin esa
variable el proceso se cae al arrancar. Requiere un Postgres local o apuntar a
uno de prueba — **nunca al de producción**.

## 6. Instalarla en el Mac

No existe un `.dmg`: es una PWA, se instala desde el navegador.

1. Abrir en **Google Chrome**: https://registro-de-turistas-production.up.railway.app
2. Menú **⋮ → Guardar y compartir → Instalar página como aplicación…**
   (o el ícono de instalar que aparece a la derecha de la barra de direcciones).
3. Queda como app en el Launchpad/Dock, con su propia ventana.

Safari de este Mac (macOS 12.6.9) **no** puede instalar PWAs — la función
"Añadir al Dock" llegó recién en macOS Sonoma. Usar Chrome.

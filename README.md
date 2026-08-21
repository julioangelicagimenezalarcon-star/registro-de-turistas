# Registro de Turistas — I. Municipalidad de Cobquecura

Registro de turistas para informadores turísticos, con panel de análisis en
porcentajes (gráficos con Chart.js) y exportación a Excel (CSV y XLSX con
fórmulas de análisis).

Este documento es el **traspaso de contexto** para seguir trabajando en este
proyecto desde **Claude Code** (u otro editor/IDE). Léelo antes de tocar
código: explica qué se hizo, por qué, y qué falta.

---

## 1. Estructura del proyecto

```
tourist-registry-app/
├── public/              LO ÚNICO que el servidor publica en internet
│   ├── index.html         Estructura HTML + <head>
│   ├── styles.css         Todos los estilos (tema "pasaporte/sello de viajero")
│   ├── app.js             Toda la lógica (formulario, storage, gráficos, exportar)
│   ├── seed-data.json     Temporada simulada (solo se sirve en localhost)
│   ├── assets/            Escudo de la Municipalidad e iconos de la PWA
│   └── vendor/            Chart.js y SheetJS alojados localmente
├── server.js            Backend Express + Postgres (NO se publica)
├── tools/               Generador del seed (NO se publica)
├── docs/                Estado, pendientes y auditorías (NO se publica)
└── README.md            Este archivo
```

**La separación `public/` no es cosmética.** Hasta el 2026-08-21 el servidor
publicaba el directorio completo: `server.js`, `package.json`, `tools/` y
`docs/` —que incluye la lista de vulnerabilidades abiertas de esta misma app y
el SQL de limpieza de la base— eran descargables por cualquiera. Si agregas un
archivo nuevo, la pregunta es siempre: *¿esto tiene que poder bajarlo un
desconocido?* Si la respuesta es no, va fuera de `public/`.

Antes de este traspaso, todo vivía en un único archivo HTML autocontenido
(pensado para el artefacto de Claude.ai). Se separó en `index.html` /
`styles.css` / `app.js` para que sea un proyecto normal, editable con
cualquier editor de código y desplegable en cualquier hosting estático.

## 2. ⚠️ LO MÁS IMPORTANTE: el almacenamiento de datos

La app original usaba `window.storage` — una API de almacenamiento **propia
del entorno de artefactos de Claude.ai** (persistente y compartida entre
usuarios del mismo artefacto). **Esa API no existe fuera de Claude.ai.**

Para que la app no se rompa al sacarla de ahí, `app.js` incluye ahora un
**adaptador de almacenamiento** (`window.__storageAdapter`) al principio del
archivo:

- Si `window.storage` existe (o sea, si igual se sigue usando dentro de un
  artefacto de Claude), lo usa tal cual — sin cambios de comportamiento.
- Si no existe (cualquier otro hosting: Netlify, GitHub Pages, servidor
  propio, `file://` local, etc.), cae automáticamente a **`localStorage`**
  del navegador.

**Limitación crítica de ese fallback:** `localStorage` es **por
dispositivo/navegador**. Cada informador vería solo sus propios registros,
no los de los demás — se pierde la característica de "bitácora compartida
entre todos los informadores" que tenía la versión original.

### Qué hacer al respecto (siguiente paso recomendado)

Para tener una base de datos real, compartida entre todos los informadores,
fuera de Claude.ai, hay que reemplazar `window.__storageAdapter` por
llamadas a un backend real. Opciones, de más simple a más robusta:

1. **Firebase Firestore / Supabase** (gratis para este volumen de datos,
   configuración en minutos, sin necesidad de mantener servidor propio).
2. **Google Sheets como base de datos** (via Google Apps Script como API),
   útil si la Municipalidad ya vive en Google Workspace.
3. **Backend propio** (Node/Express + Postgres o SQLite) si quieren control
   total.

El adaptador ya está aislado en una función (ver la parte de arriba de
`app.js`) precisamente para que este reemplazo sea un cambio localizado: hay
que reescribir `get`, `set`, `delete`, `list` para que hablen con el backend
elegido, sin tocar el resto de la lógica de la app (que solo llama a
`window.__storageAdapter.get/set`).

## 3. Qué hace la app (funcionalidad actual)

- **Login** (`#login-screen`): pantalla de acceso previa a la app. Selector
  desplegable con el personal habilitado (por ahora solo **Angélica
  Alarcón** — falta que la Municipalidad entregue el listado completo de
  informadores, ver sección 7). Al ingresar, el nombre queda guardado en
  `sessionStorage` (`bt_current_user`) y autocompleta el campo "Informador"
  de cada registro nuevo.
- **Registrar** (`#panel-registrar`): formulario con fecha, país (selector
  con todos los países del mundo, `Chile` por defecto), nombre del
  informador (opcional autocompletado por el login), **total de turistas
  del grupo** (select 1–20, es el campo que define el tamaño del grupo),
  subdivisión por sexo (Femenino/Masculino) y subdivisión por rango de edad
  (Menor de 18, 18–29, 30–40, 41–50, 50+) — estas dos subdivisiones ahora
  son selects desplegables (no inputs numéricos) acotados dinámicamente al
  total elegido (si el total es 5, cada select ofrece 0–5; sin total
  elegido ofrecen 0–20 por defecto). Sexo y edad se validan contra el total
  (aviso visual si no cuadran, no bloquean el guardado — ver sección 7),
  motivo del viaje (select de opciones fijas; al elegir "Otro" aparece un
  campo de texto para especificarlo, y ese texto queda como el motivo
  guardado), atractivos turísticos (desplegable propio de selección
  múltiple por checkboxes — botón que muestra "N atractivos
  seleccionados" y abre un panel; ver sección 8 sobre el contenido actual
  de esta lista) y servicios turísticos: dos desplegables adicionales
  (mismo componente que atractivos) para **Alojamiento** (Cabañas,
  Hostales, Campings, Hotel, Lodge, Residencial) y **Transporte** (Buses,
  Taxis), más chips planas para Restaurantes, Guías turísticos, Tours
  Operadores y Oficinas de información turística. Las tres fuentes
  (alojamiento, transporte, chips) escriben al mismo array `servicios` del
  registro. Tanto atractivos como servicios tienen un input "Agregar
  otro(s), separados por coma…" para entradas fuera del listado fijo.

  Si el país elegido es `Chile`, aparece además una cascada Región → Comuna
  con los datos reales de las 16 regiones (`CHILE_REGIONES` en `app.js`,
  todas las comunas de la región juntas y ordenadas alfabéticamente, sin
  paso intermedio de "Ciudad"/provincia). El registro guarda `pais`,
  `region` y `comuna` por separado, y el campo `procedencia` (usado en
  Panel/Historial/exportes) queda como la comuna si es Chile, o el nombre
  del país si es extranjero.
- **Panel** (`#panel-panel`): dashboard con gráficos Chart.js — dona de
  género, barras horizontales de % para edad, motivo, procedencia,
  atractivos y servicios. Todo se recalcula en vivo desde los registros
  guardados. Incluye además dos vistas temporales: **Flujo diario de
  turistas** (línea de área por fecha, la temporada completa) y **Días de
  mayor afluencia** (barras por día de la semana + ranking de las 5 fechas
  peak) — ver sección 8.
- **Historial** (`#panel-historial`): lista de todos los registros con
  opción de eliminar, más dos botones de exportación:
  - **Exportar CSV**: exporta los datos crudos.
  - **Exportar Base de Datos (Excel)**: genera un `.xlsx` con dos hojas
    (Registros + Análisis con fórmulas activas — porcentajes, no valores
    fijos) usando la librería SheetJS, cargada por CDN.

## 4. Cómo probar localmente

Es HTML/CSS/JS puro, sin build step. Basta con servir la carpeta:

```bash
cd tourist-registry-app/public
python3 -m http.server 8080
# abrir http://localhost:8080 en el navegador
```

(Ojo: hay que pararse dentro de `public/`, no en la raíz del proyecto.)

(No abras `index.html` con doble clic / `file://` directo — algunos
navegadores bloquean `fetch`/scripts locales por CORS. Sirve la carpeta con
un servidor simple como el de arriba.)

## 5. Cómo desplegarlo

Al ser estático, cualquier hosting estático sirve: Netlify, Vercel, GitHub
Pages, Cloudflare Pages, un bucket S3, etc. Solo hay que subir la carpeta
completa (`index.html`, `styles.css`, `app.js`, `assets/`) manteniendo la
misma estructura relativa.

## 6. Dependencias externas (CDN, sin instalación)

Cargadas directamente en `index.html` vía `<script src="https://cdnjs...">`:

- **Chart.js 4.5.0** — gráficos del Panel.
- **SheetJS (xlsx) 0.18.5** — exportación a Excel.
- **Google Fonts** (Fraunces + IBM Plex Sans/Mono) — tipografía.

Si se quiere trabajar offline o evitar depender de CDNs externos, se pueden
descargar estas librerías y servirlas localmente (`npm install chart.js
xlsx` + bundler, o simplemente descargar los `.js` a una carpeta `vendor/`
y cambiar las rutas de los `<script src>`).

**⚠️ Riesgo conocido de las versiones fijas en CDN:** cdnjs va eliminando
versiones viejas con el tiempo. El 2026-07-20 se encontró que la versión
`4.4.4` de Chart.js ya no existía en cdnjs (devolvía 404) — como
`Chart.defaults.font.family = ...` se ejecutaba en el nivel superior del
script, ese error silencioso (no aparecía en consola de forma obvia)
**rompía toda la inicialización de la app**: nada se guardaba, Historial y
los desplegables de Atractivos/Servicios quedaban vacíos, sin ningún
mensaje de error visible. Se actualizó a `4.5.0` (versión vigente al
momento de este fix) y además se agregó una guarda (`hasChart` en
`app.js`) para que, si vuelve a pasar, solo se pierdan los gráficos del
Panel — el resto de la app (guardar, exportar, listas) sigue funcionando.
Si en el futuro el Panel deja de mostrar gráficos, lo primero que hay que
revisar es si la URL de Chart.js en `index.html` sigue siendo válida.

## 7. Pendientes / ideas para seguir

- [ ] **Listado completo de personal** para el login (`PERSONAL` en
      `app.js`, línea ~48) — hoy solo tiene a "Angélica Alarcón". Falta que
      la Municipalidad entregue los nombres del resto del equipo.
- [ ] **Backend real** para reemplazar el fallback de `localStorage` (ver
      sección 2) — esto es lo único que bloquea el uso multi-usuario fuera
      de Claude.ai.
- [ ] Autenticación real / control de acceso por informador (el login
      actual es solo un selector de nombre sin contraseña — identifica
      quién registra, pero no restringe quién puede entrar ni borrar
      registros).
- [ ] Validación de formulario más estricta (actualmente valida país/región/
      ciudad/comuna cuando el país es Chile; los conteos de edad/género no
      bloquean el guardado aunque no cuadren, solo muestran una advertencia
      visual).
- [ ] Paginación en "Historial" si la cantidad de registros crece mucho
      (ahora mismo renderiza todos los registros de una vez).
- [ ] Tests automatizados (no hay ninguno todavía).
- [ ] PWA "de verdad" con service worker para soporte offline real (hoy
      solo tiene las meta tags para "Agregar a pantalla de inicio", que dan
      apariencia de app pero no funcionamiento sin internet garantizado).

## 8. Historial de decisiones relevantes (contexto de por qué las cosas son como son)

- **(2026-08-21) Borrar deja de ser destructivo (CN-010)**. Antes, un toque en
  "Eliminar" hacía un `DELETE` físico e inmediato: el registro desaparecía para
  todos, sin preguntar, sin deshacer y sin dejar rastro de quién lo hizo. En un
  celular, en terreno, con el turista esperando.

  Ahora el borrado es **lógico**: `eliminado_en` y `eliminado_por` se marcan y la
  fila se queda en la base. `GET /api/records` filtra por `eliminado_en IS NULL`,
  y dos endpoints nuevos —`GET /api/records/eliminados` y
  `POST /api/records/:id/restaurar`— permiten ver y recuperar lo borrado desde la
  propia app, sin entrar a la base a mano. En el Historial aparece el botón
  "Ver eliminados" (solo con backend compartido: en modo local no hay dónde
  guardar el registro oculto).

  La confirmación **dice de qué registro se trata** ("3 turistas de Chillán, del
  21 de agosto"), no un "¿estás seguro?" a ciegas.

  De paso se corrigió un bug feo del código anterior: si el `fetch` del borrado
  fallaba, la app **igual sacaba el registro de la pantalla**. Decía "borrado"
  mientras el registro seguía intacto en la base. Ahora, si el servidor no lo
  acepta, no se toca la vista y se avisa.

  **Sobre `eliminado_por`, honestamente:** la sesión es una clave compartida por
  todo el equipo, así que el servidor **no puede saber** quién es realmente quien
  borra — el nombre lo declara el propio cliente, tomado del selector del login.
  Sirve para saber qué pasó en el día a día, no como prueba. Para que fuera
  confiable haría falta un PIN por informador.

  La migración es aditiva (`ADD COLUMN IF NOT EXISTS`): no reescribe ni borra
  ninguna fila existente.

- **(2026-08-21) La API pasa a exigir clave de acceso (CN-001 de la auditoría)**.

  ⚠️ **`APP_CLAVE` es obligatoria: sin esa variable de entorno el servidor NO
  arranca.** Es a propósito (falla cerrado) — arrancar "abierto por defecto" es
  exactamente como estuvo esto hasta hoy. **Al desplegar, configurar primero la
  variable en Railway y recién después subir el código**, o el servicio se cae.

  Cómo funciona: la clave vive solo en el servidor. `POST /api/login` la compara
  en tiempo constante y devuelve una cookie `rt_sesion` firmada con HMAC-SHA256
  (`HttpOnly`, `SameSite=Lax`, `Secure` bajo https, 6 meses). Todo lo que cuelga
  de `/api` exige esa cookie; las únicas excepciones públicas son
  `GET /api/sesion` —que solo dice si hay sesión, y es lo que le permite al front
  saber si pedir la clave— y el propio login.

  **Por qué no un token en el front:** cualquiera que abra el código de la página
  lo lee. Con la cookie firmada el navegador nunca ve la clave, y como es
  `HttpOnly` tampoco se puede robar la sesión desde JavaScript.

  Se agregó freno a la fuerza bruta: 15 intentos por IP en 10 minutos y 300 en
  total. Los topes son altos a propósito — los informadores comparten el WiFi de
  la municipalidad, así que comparten IP, y un tope bajo los bloquearía entre
  ellos; para adivinar una clave larga, 15 intentos no sirven de nada. El tope
  global se dejó alto por lo contrario: si es muy bajo, un atacante puede dejar
  fuera al equipo real solo con fallar (lección de SIC-PRO, donde el ataque vino
  repartido entre muchas IP).

  En el front: `iniciarPantallaLogin()` consulta `/api/sesion` y solo muestra el
  campo de clave si hay backend y no hay sesión. **Lo delicado fue el 401**: si
  se confundiera con "no hay servidor", la app caería a `localStorage` sin avisar
  y los registros quedarían guardados solo en ese teléfono. Por eso
  `fetchSharedData()` marca el 401 aparte (`err.noAutorizado`) y la app vuelve a
  pedir la clave en lugar de seguir como si nada.

  También se agregaron cabeceras de seguridad (CSP, `X-Frame-Options: DENY`,
  `nosniff`, HSTS bajo https) — CN-006. `'unsafe-inline'` sigue habilitado para
  estilos porque las barras del Panel llevan el ancho en el atributo `style`.

  `/api/import` ya no es público: quedó detrás de la sesión, no eliminado, para
  poder migrar datos cuando haga falta.

- **(2026-08-21) Escala de los gráficos de % y Procedencia región ⇄ comuna**:
  Julio reportó que el gráfico de Procedencia era ilegible. Eran dos cosas.

  **(a) La escala estaba clavada en 100%.** `makePercentBar()` fijaba el eje X
  con `Math.max(100, ...)`, así que un gráfico cuya barra más alta era 11,2%
  dejaba el 89% del ancho vacío — y afectaba a los cinco gráficos de barras, no
  solo a Procedencia. Ahora `escalaPct()` sube al siguiente corte redondo sobre
  el dato real (Procedencia por comuna pasó de 0-100% a 0-15%; motivo a 0-60%;
  edad a 0-35%). Se usan cortes fijos y no el máximo exacto para que el eje siga
  siendo fácil de leer.

  **(b) 124 procedencias distintas en 280 px**, 44 de ellas con un solo
  registro — y esto no es un artefacto de la simulación: con datos reales serán
  más comunas todavía. La tarjeta ahora abre agrupada **por región** (12 barras
  que cubren el 100% de los registros) con un selector para ver el detalle **por
  comuna**. Son dos preguntas distintas: dónde promocionar, y quién exactamente
  está viniendo. Estado en `procedenciaVista`, funciones
  `procedenciaPorRegion()` y `pintarProcedencia()`.

  El detalle por comuna muestra las 12 principales. Lo que queda fuera **no se
  recorta en silencio**: va como nota bajo el gráfico ("otras 112 procedencias
  suman 699 registros, 56,1% del total"). Se probó ponerlo como una barra más
  —"Otras 112 comunas"— pero al ser un agregado del 56% aplastaba a las comunas
  reales, que es justo lo que la vista quiere comparar.

  Ojo con `pct()`: su resultado también se parsea con `parseFloat` en los KPI
  del Panel, así que devuelve el decimal con **punto**. Si se necesita coma para
  mostrar, se convierte en el punto de uso — no dentro de `pct()`.

- **(2026-08-21) Temporada alta simulada (`tools/generar-seed-temporada.py`)**:
  la app se estrena en terreno en la temporada **dic-2026 → mar-2027** y hasta
  entonces la base real está casi vacía (1 registro), así que el Panel no se
  podía evaluar ni mostrar. El seed pasó a generarse con un script
  **determinista** (semilla fija: mismo script → mismo archivo, verificado por
  sha256) en vez de ser un JSON opaco, para poder ajustar los supuestos y
  regenerar. Reemplazó a la simulación anterior (932 registros, dic-2025 →
  feb-2026), respaldada en `tools/seed-data.ANTERIOR.json`.

  Lo que modela: estacionalidad por tramos (Año Nuevo y Fiesta de la Candelaria
  como los dos peaks duros, marzo apagado por la vuelta a clases), efecto fin de
  semana —atenuado en pleno enero, porque el que está de vacaciones pasea igual
  un martes—, tipos de grupo (familia / pareja / amigos / solo / tour) con su
  propia composición de edad y sexo, procedencia dominada por Ñuble y Biobío
  (Chillán es la comuna #1), ~9% de extranjeros con Argentina a la cabeza, y
  Surf ~16% de los registros concentrado en Buchupureo.

  Reglas que el generador respeta y que conviene no romper:
  * **Toda comuna sale de `tools/comunas-chile.json`**, extraído del propio
    `CHILE_REGIONES` de `app.js`. Si una comuna no está en el selector de la
    app, no puede estar en los datos — el script lo verifica con un `assert`.
  * **Cada registro lleva `id` con prefijo `sim-`.** Es la marca que distingue
    un registro simulado de uno real, y tiene que ser imposible de confundir.
  * `femenino + masculino == total` y la suma de los 5 rangos de edad `== total`,
    igual que exige el formulario.

  Supuesto declarado: la Fiesta de la Candelaria se modela en su fecha
  litúrgica, el **2 de febrero** — no se verificó contra el calendario real de
  la Municipalidad.

  ⚠️ **Estos datos no se cargan nunca contra la base de producción.** Ver el
  riesgo del auto-seed en `docs/ESTADO-Y-MEJORAS.md` §2.

- **(2026-08-21) Gráfico "Días de mayor afluencia"**: pedido explícito de
  Julio. Es distinto del "Flujo diario" que ya existía: el flujo es la línea
  de tiempo (qué pasó cada fecha), mientras que este agrupa **todos** los
  registros por día de la semana, para ver el patrón que se repite —
  la pregunta útil para decidir turnos de informadores y para que los
  negocios locales sepan qué días conviene abrir. La tarjeta trae dos cosas:
  barras Lun→Dom con el **total de turistas** (el día peak se pinta en
  dorado `#C99A3E`, el resto en azul municipal `#2E6DB4`) y, al lado, un
  ranking de las **5 fechas peak** de la temporada con su fecha exacta.
  El tooltip agrega el **promedio por jornada** y cuántas jornadas de ese
  día se registraron, porque un rango de fechas casi nunca tiene la misma
  cantidad de sábados que de lunes y el total solo puede engañar.
  Funciones nuevas en `app.js`: `weekdayIndex()`, `weekdayStats()` y
  `makeDiaSemanaChart()`. **Los colores son estáticos a propósito** (array
  precalculado, nunca callbacks 'scriptable') — es la misma trampa que
  rompía el Panel en Safari/iOS el 2026-07-31.

- **Login (2026-07-14)**: se pidió explícitamente como selector de nombre
  sin contraseña (no es autenticación real, ver pendientes). El nombre
  elegido autocompleta "Informador" en cada registro para que el personal
  en terreno no lo reescriba cada vez.
- **País/Región/Ciudad/Comuna (2026-07-14)**: reemplaza el campo libre
  "Procedencia". La cascada de Chile usa Región → Provincia (mostrada como
  "Ciudad", por pedido explícito del cliente, aunque no es un nivel
  administrativo oficial) → Comuna. Datos de las 16 regiones verificados
  contra Wikipedia (`es.wikipedia.org`, páginas por región) antes de
  cargarlos a mano en `CHILE_REGIONES`.
- El logo de la Municipalidad se pidió embebido en el header, favicon y
  apple-touch-icon — ahora vive como archivo real en `assets/` en vez de
  base64 inline (mejor para mantenimiento; el HTML pesaba ~150KB solo por
  el base64 repetido 3 veces).
- La lista de servicios turísticos fue definida explícitamente por el
  cliente (ver sección 3) — no es de relleno, refleja servicios reales de
  Cobquecura.
- **Atractivos turísticos (2026-07-20):** la lista original (Lobería,
  Rinconada, Buchupureo, Pullay, Trehualemu, Santa Rita, Mela, Museos —
  lugares físicos) fue **reemplazada** por 10 tipos de alojamiento
  (Hoteles, Hoteles Boutique, Apart-Hoteles, Hosterías y Residenciales,
  Hostales y Albergues, Cabañas y Departamentos Turísticos, B&B, Centros
  de Turismo de Naturaleza/Lodges, Complejos Turísticos/Resorts, Camping),
  a pedido explícito del cliente a partir de un texto que en realidad
  describía categorías de hospedaje, no atractivos. Se le avisó del
  desajuste semántico (esto encajaría mejor como subcategorías de
  "Hospedaje" dentro de Servicios turísticos) y confirmó instalarlo tal
  cual en "Atractivos turísticos". Si se agregan más puntos a la lista de
  observaciones y esto se corrige, el array a editar es
  `DEFAULT_ATRACTIVOS` en `app.js`.
- **Atractivos turísticos → desplegable (2026-07-20):** dejó de ser una
  grilla de chips siempre visible y pasó a ser un desplegable real (botón
  que abre un panel con checkboxes, se cierra al hacer clic afuera) —
  pedido explícito del cliente, más compacto para listas largas. (Nota:
  Servicios turísticos también pasó a usar este mismo componente para
  Alojamiento/Transporte el 2026-07-20, ver más abajo.)
- **Total de turistas + subdivisiones (2026-07-20):** el flujo se invirtió.
  Antes "Total" era un valor calculado (Femenino + Masculino). Ahora
  "Total de turistas del grupo" es un select (1–20) que el informador
  elige primero, y las subdivisiones por sexo y por rango de edad
  (ambas ahora selects desplegables, no inputs numéricos) se acotan a ese
  total y se validan contra él — mismo criterio no-bloqueante que ya
  existía (aviso visual si no cuadra, no impide guardar).
- Región → Comuna (Chile) se simplificó a 2 niveles: se sacó el paso
  intermedio "Ciudad" (capital de provincia) porque el cliente pidió ver
  todas las comunas de la región junta, "incluyendo los pueblitos" que
  quedaban escondidos detrás del filtro por provincia.
- El diseño visual sigue una identidad "pasaporte/sello de viajero"
  (paleta verde-teal oscuro + dorado + rojo sello), a propósito distinta de
  paletas genéricas de dashboards. Se le sumaron toques de la paleta real
  de la Municipalidad (azul océano `--cobq-blue` y verde `--cobq-green`,
  extraídos de `assets/logo-cobquecura.jpg`) en acentos puntuales: chips
  seleccionados, focus rings, línea bajo el masthead, tarjeta de login,
  números destacados del Panel y paleta de los gráficos — sin reemplazar
  la identidad pasaporte/sello de base.
- Todos los `%` en el Panel y en el Excel exportado se calculan con
  fórmulas activas (no valores fijos) para que se puedan seguir usando
  aunque se agreguen más datos manualmente después.
- **(2026-07-20) Se eliminó el modo demo**: existió temporalmente un
  cargador de datos de prueba (`?demo=1` + `demo-seed-data.json`, una
  simulación de 3 meses/380 registros) para revisar el Panel con volumen
  de datos. Se retiró por pedido del cliente — ya no existe ni el archivo
  ni el código que lo cargaba.
- **(2026-07-20) Renombre "Bitácora Turística" → "Registro de Turistas"**:
  cambiado en `<title>`, meta tags, ambos `<h1>` (masthead y login),
  nombres de archivo exportados (`registro-turistas.csv`,
  `registro-turistas-db.xlsx`) y encabezado del README. El `STORAGE_KEY`
  interno (`bitacora-turistica-data`) se dejó igual a propósito —
  no es visible para nadie y cambiarlo no aportaba nada.
- **(2026-07-20) Motivo del viaje**: se eliminó la opción "Tránsito" (no
  pedida por el cliente) y "Otro" ahora revela un campo de texto libre
  (`#f-motivo-otro`) — lo que se escriba ahí reemplaza a "Otro" como el
  motivo guardado en el registro.
- **(2026-07-20) Atractivos turísticos — segundo reemplazo de la lista**:
  la lista de tipos de alojamiento (Hoteles, Hoteles Boutique, etc.,
  agregada el mismo día por error de interpretación de un texto del
  cliente — ver entrada anterior) se reemplazó por la lista real de
  atractivos/lugares de Cobquecura: Lobería, Iglesia de Piedra,
  Buchupureo, Pullay, Trehualemu, Rinconada, Santa Rita, Humedal Taucú,
  Humedal Colmuyao, Monte Zorro, Mela, Parque las Nalkas, Ecomuseo,
  Minimuseo, Cerro el Calvario, Centro Artesanal, Parque los Avellanos,
  Fiesta de la Candelaria. El componente desplegable no cambió, solo el
  contenido de `DEFAULT_ATRACTIVOS`.
- **(2026-07-20) Servicios turísticos — Alojamiento y Transporte como
  sub-desplegables**: se generalizó el componente de dropdown de
  atractivos (`setupDropdownMultiselect()` en `app.js`) para no duplicar
  código, y se instanció dos veces más: **Alojamiento** (Cabañas,
  Hostales, Campings, Hotel, Lodge, Residencial) y **Transporte** (Buses,
  Taxis). Restaurantes, Guías turísticos, Tours Operadores y Oficinas de
  información turística quedaron como chips planas (sin sub-desplegable,
  no se pidió). Las tres fuentes escriben al mismo `selectedServicios` /
  array `servicios` del registro — un registro puede terminar con, por
  ejemplo, `["Cabañas","Buses","Restaurantes"]`.

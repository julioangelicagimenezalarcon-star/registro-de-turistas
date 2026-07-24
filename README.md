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
├── index.html          Estructura HTML + <head> (fuentes, Chart.js, SheetJS)
├── styles.css           Todos los estilos (tema "pasaporte/sello de viajero")
├── app.js               Toda la lógica (formulario, storage, gráficos, exportar)
├── assets/
│   └── logo-cobquecura.jpg   Escudo de la Municipalidad (favicon, apple-touch-icon, header)
└── README.md            Este archivo
```

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
  guardados.
- **Historial** (`#panel-historial`): lista de todos los registros con
  opción de eliminar, más dos botones de exportación:
  - **Exportar CSV**: exporta los datos crudos.
  - **Exportar Base de Datos (Excel)**: genera un `.xlsx` con dos hojas
    (Registros + Análisis con fórmulas activas — porcentajes, no valores
    fijos) usando la librería SheetJS, cargada por CDN.

## 4. Cómo probar localmente

Es HTML/CSS/JS puro, sin build step. Basta con servir la carpeta:

```bash
cd tourist-registry-app
python3 -m http.server 8080
# abrir http://localhost:8080 en el navegador
```

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

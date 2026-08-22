# Lecciones — Registro de Turistas

Registro de errores reales y de la regla que dejó cada uno. Se lee **antes** de
tocar código: es barato y evita repetir lo que ya costó caro.

---

## 2026-08-21 — El verificador pintaba el fondo de negro y el informe parecía ilegible

- **Qué pasó:** al revisar el informe Excel convertido a PDF y luego a PNG, toda
  la hoja salía con fondo negro y el texto oscuro encima, aparentemente
  ilegible. Parecía un error grave del generador.
- **Causa raíz:** el archivo estaba perfecto. Las celdas de texto no tienen
  relleno (`patternType=None`), así que el PDF las deja **transparentes**, y
  `sips` al rasterizar a PNG compone esa transparencia sobre **negro**. El
  defecto era del conversor, no del documento.
- **Cómo se corrigió:** se leyeron los colores reales del archivo con openpyxl
  (`fill.fgColor`, `font.color`) y se confirmó que estaban bien; se repitió el
  render a **JPEG**, que no tiene canal alfa, y se vio correcto.
- **Regla para no repetirlo:** para revisar un xlsx a ojo, convertir a **JPEG**,
  no a PNG. Y si un render contradice algo que ya se sabía cierto, **comprobar
  el dato en la fuente antes de creerle al verificador**.

---

## 2026-08-21 — ExcelJS ni siquiera puede ABRIR un archivo que tenga gráficos

- **Qué pasó:** se evaluó la idea de tener una plantilla .xlsx con gráficos ya
  dibujados y rellenar los datos desde Node con ExcelJS.
- **Causa raíz:** ExcelJS no soporta gráficos. Al leer un archivo que los
  contiene revienta con `TypeError: Cannot read properties of undefined
  (reading 'anchors')` en `xlsx.js:100`. No es que los pierda al guardar: **no
  puede leer el archivo**.
- **Cómo se corrigió:** se descartó la vía de plantilla. Para gráficos nativos
  la salida sería inyectar el XML del gráfico en el .xlsx ya generado, con
  `jszip` (probado y funcionando), o generar con Python + openpyxl.
- **Regla para no repetirlo:** no diseñar nada que dependa de que ExcelJS lea un
  archivo con gráficos, imágenes complejas o formas. Para preservar esas piezas,
  manipular el .xlsx como zip y no dejar que ExcelJS lo reescriba.

---

## 2026-08-21 — Excel cortaba el último renglón del texto sin avisar

- **Qué pasó:** en las secciones largas del análisis narrado, la última línea
  aparecía cortada en el archivo entregado.
- **Causa raíz:** el alto de cada fila se calcula estimando cuántos caracteres
  entran por línea. Se estimó 108 y el ancho real daba unos 88: al subestimar
  las líneas, la fila quedaba baja y Excel recorta **en silencio**.
- **Cómo se corrigió:** se ajustó el divisor al ancho real y se subió el alto por
  línea. En el layout actual el texto se mergea sobre 112 unidades y el divisor
  es `/100`, que sobreestima líneas y queda del lado seguro.
- **Regla para no repetirlo:** al cambiar anchos de columna o el merge de un
  bloque de texto, **recalcular el divisor y mirar el archivo convertido**. Este
  error no se ve leyendo el código.

---

## 2026-08-21 — Verificar que las fórmulas DEN resultado, no que estén escritas

- **Qué pasó:** el informe se daba por bueno comprobando que las fórmulas
  estuvieran presentes en las celdas.
- **Causa raíz:** openpyxl y ExcelJS escriben la fórmula como texto, sin
  evaluarla. Una fórmula con un rango malo se ve idéntica a una correcta.
- **Cómo se corrigió:** se usa `recalc.py` de la habilidad `xlsx`, que recalcula
  con LibreOffice y reporta `#REF!`, `#DIV/0!`, etc. Estado actual: **0 errores
  en 80 fórmulas**.
- **Regla para no repetirlo:** todo .xlsx con fórmulas se entrega recalculado.
  El script busca `soffice` en el PATH; en este equipo hay que anteponer
  `/Applications/LibreOffice.app/Contents/MacOS`.

---

## 2026-08-21 — El tablero mostraba ceros y no decía por qué

- **Qué pasó:** Julio cambió el período en el Dashboard y todas las cifras
  quedaron en 0. La casilla mostraba `01/12/26`.
- **Causa raíz:** dos capas. (1) El selector comparaba **texto** (`$C$5`) contra
  la columna Mes, que guarda "Diciembre 2026"; al escribir una fecha, Excel la
  guarda como número y ninguna comparación calza. (2) Peor: **LibreOffice
  interpretó `01/12/26` como enero de 2026**, un mes sin registros — así que
  aunque la comparación hubiera funcionado, el resultado real era 0. El tablero
  no tenía forma de decirlo.
- **Cómo se corrigió:** se agregó la columna `MesNum` (AAAAMM numérico) a la hoja
  Datos y una celda oculta `I5` que normaliza lo que haya en el selector: 0 =
  toda la temporada, AAAAMM si es texto conocido **o si es una fecha**, -1 si no
  se reconoce. Todas las fórmulas comparan contra ese número. Y se agregó un
  aviso en rojo (`B6`) que distingue los dos casos: "ese período no existe" y
  "se entendió el mes AAAA-MM, que no tiene registros".
- **Regla para no repetirlo:** **una cifra en cero tiene que poder explicarse
  sola.** Si un tablero filtra por algo que el usuario escribe, validar la
  entrada y decir en pantalla por qué no hay datos — el cero mudo se lee como
  "no vino nadie", que es una conclusión falsa. Y nunca comparar contra texto lo
  que Excel puede convertir en fecha: comparar contra un número.

---

## 2026-08-21 — Revertir un commit reintrodujo un defecto de layout

- **Qué pasó:** al volver `informe.js` a la versión previa por pedido de Julio,
  las etiquetas del Dashboard ("Lunes", "Martes"...) volvieron a caer en la
  columna A, que mide 3 de ancho, y salían cortadas.
- **Causa raíz:** el commit revertido no solo traía estilos: también había
  corregido ese desfase moviendo las tablas a la columna B. Revertir "lo
  estético" se llevó puesta una corrección funcional.
- **Cómo se corrigió:** `tituloSeccion` y `encabezadoTabla` recibieron un
  parámetro `desdeCol` (por defecto 1, para no alterar la hoja Análisis, donde
  la columna A mide 34) y el Dashboard lo usa con 2.
- **Regla para no repetirlo:** antes de revertir un commit, **listar qué
  arreglos funcionales viajaron dentro de él** y reaplicarlos. Un commit
  titulado "estilos" casi nunca trae solo estilos.

---

## 2026-08-21 — El verificador borró la hoja de datos y todo salió #NAME?

- **Qué pasó:** para mirar solo el Dashboard, una macro borró las otras hojas.
  El render salió con `#NAME?` en cada fórmula y parecía que el archivo estaba
  roto.
- **Causa raíz:** todas las fórmulas del tablero referencian `Datos!`. Al borrar
  esa hoja, quedaron sin destino. El archivo estaba perfecto; lo rompió la
  prueba.
- **Cómo se corrigió:** la macro ahora **oculta** las hojas (`IsVisible = False`)
  en vez de borrarlas. LibreOffice imprime solo las visibles, que era lo único
  que se necesitaba.
- **Regla para no repetirlo:** al aislar una parte de un archivo para revisarla,
  **ocultar, no eliminar** — y si el resultado se ve peor de lo esperado,
  sospechar del método de aislamiento antes que del archivo. Es la tercera vez
  en el mismo día que el verificador miente (ver la del fondo negro).

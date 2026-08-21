# Carga de la simulación en la base de PRODUCCIÓN — 2026-08-21

> Este archivo existe para poder **deshacer** esta carga con precisión.
> Si lo pierdes, la única forma de separar lo simulado de lo real vuelve a ser
> la fecha — y desde diciembre de 2026 eso deja de servir.

## Qué se cargó

Los 1.245 registros simulados de `seed-data.json` (temporada dic-2026 →
mar-2027, generados con `tools/generar-seed-temporada.py`) se insertaron en la
base compartida de producción vía `POST /api/import`, en lotes de 150.

- Insertados: **1.245** (0 errores)
- **Rango de ids ocupado por la simulación: `937` a `2181`** (contiguo)
- Fechas de esos registros: 2026-12-15 a 2027-03-15
- Total en la base después: 1.246 registros / 4.704 turistas

## El único registro REAL

| id | fecha | procedencia | informador |
|----|-------|-------------|------------|
| **936** | 2026-07-31 | Alemania | Angélica Alarcón |

Respaldado aparte en `../respaldos/produccion-antes-del-deploy-2026-08-21.json`.
Verificado intacto después de la carga.

## Cómo deshacerlo

```sql
DELETE FROM records WHERE id BETWEEN 937 AND 2181;
```

Ese rango **solo** contiene registros simulados: no toca el id 936 ni ninguno
que se cree de aquí en adelante (la secuencia sigue desde 2182).

## Decisión de Julio (2026-08-21): la simulación se queda hasta diciembre

Se mantiene en producción para poder mostrar el Panel con datos durante los
próximos meses. **No es permanente.**

### La fecha límite real

No es "diciembre" a secas: la simulación **empieza el 15-dic-2026**. Desde ese
día sus registros caen en el mismo rango de fechas en que los informadores
estarán registrando turistas de verdad, y el Panel mostraría 4.703 turistas
inventados mezclados con los reales.

**Limpiar antes del 15 de diciembre de 2026, o antes del primer registro real
en terreno — lo que ocurra primero.** Lo recomendable es la primera semana de
diciembre.

## ⚠️ Por qué no se puede postergar

Al insertarlos por la API, el prefijo `sim-` de cada id **se pierde** — Postgres
asigna ids nuevos. Hoy los simulados se distinguen por su rango de id y por su
fecha; en cuanto los informadores empiecen a registrar turistas de verdad en
dic-2026, las fechas dejan de servir como criterio y **solo queda este archivo**.

**Limpiar la base antes de que arranque la temporada.**

### Después de limpiar, comprobar

```sql
-- Debe quedar solo el registro real (id 936) más lo que se haya capturado en terreno.
SELECT count(*) FROM records WHERE id BETWEEN 937 AND 2181;   -- esperado: 0
SELECT count(*) FROM records;                                  -- esperado: 1 + los reales
```

El borrado desde la app es lógico desde el 2026-08-21, pero este `DELETE` es SQL
directo contra la base: sí borra de verdad, que es lo que corresponde con datos
inventados.

## Efecto secundario conocido

El registro real es del 31-jul-2026 y la simulación parte el 15-dic-2026, así
que el gráfico "Flujo diario de turistas" muestra cuatro meses planos en el
medio. Es esperable y desaparece al limpiar la simulación.

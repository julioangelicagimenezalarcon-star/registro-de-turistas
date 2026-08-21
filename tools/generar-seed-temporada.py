#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera `seed-data.json`: una temporada alta SIMULADA de Cobquecura.

Por qué existe: la app se estrena en terreno en la temporada dic-2026 → mar-2027
y hasta entonces la base real está casi vacía (1 registro). Sin volumen, el
Panel no se puede evaluar ni mostrar. Esto arma esa temporada como se espera que
ocurra, para revisar los gráficos antes de que lleguen los datos de verdad.

Reglas que se respetan a propósito:
  * Es DETERMINISTA (semilla fija): mismo script -> mismo archivo. Se puede
    regenerar y versionar sin que cambie por debajo.
  * Toda comuna sale de `tools/comunas-chile.json`, extraído del propio
    `CHILE_REGIONES` de app.js. Ninguna comuna inventada: si no está en el
    selector de la app, no puede estar en los datos.
  * Cada registro lleva `id` con prefijo "sim-". Es la marca que distingue un
    registro simulado de uno real, y tiene que ser imposible de confundir.
  * `femenino + masculino == total` y la suma de los 5 rangos de edad == total,
    igual que exige el formulario.

NUNCA cargar esto contra la base de producción.

Uso:  python3 tools/generar-seed-temporada.py
"""
import json, os, random, datetime as dt

SEMILLA = 20260821
rnd = random.Random(SEMILLA)

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

INICIO = dt.date(2026, 12, 15)
FIN    = dt.date(2027, 3, 15)

INFORMADORES = [("Angélica Alarcón", 0.55), ("Informador 2", 0.25), ("Informador 3", 0.20)]

# Registros esperados en un día "normal" de temporada, antes de los factores.
BASE_DIARIA = 12

# --- Estacionalidad -------------------------------------------------------
# Cobquecura se llena por tramos, no parejo: Año Nuevo y la Candelaria son los
# dos peaks duros; marzo se apaga con la vuelta a clases.
def factor_periodo(d):
    if d <= dt.date(2026, 12, 23): return 0.35   # aún hay clases y trabajo
    if d <= dt.date(2026, 12, 30): return 0.70   # Navidad, empieza a llegar gente
    if d <= dt.date(2027, 1, 4):   return 1.80   # Año Nuevo — peak duro
    if d <= dt.date(2027, 1, 31):  return 1.35   # enero, vacaciones plenas
    # Fiesta de la Candelaria: el 2 de febrero es EL día, el resto es el arrastre
    # de la fiesta. (Supuesto: se celebra en la fecha litúrgica, el 2 de febrero.)
    if d == dt.date(2027, 2, 2):   return 2.90
    if d <= dt.date(2027, 2, 3):   return 2.10
    if d <= dt.date(2027, 2, 4):   return 1.75
    if d <= dt.date(2027, 2, 8):   return 1.50
    if d <= dt.date(2027, 2, 20):  return 1.20
    if d <= dt.date(2027, 2, 28):  return 0.95   # empieza a bajar
    return 0.40                                   # marzo: vuelta a clases

def es_candelaria(d):
    return dt.date(2027, 1, 31) <= d <= dt.date(2027, 2, 4)

# Lun..Dom. El fin de semana manda, pero en pleno enero se aplana:
# el que está de vacaciones pasea igual un martes.
FACTOR_DOW = [0.75, 0.68, 0.74, 0.86, 1.30, 1.60, 1.35]

def factor_dow(d):
    f = FACTOR_DOW[d.weekday()]
    if dt.date(2027, 1, 5) <= d <= dt.date(2027, 1, 31):
        f = 1 + (f - 1) * 0.55   # atenúa el efecto fin de semana
    if es_candelaria(d):
        # A una fiesta religiosa la gente va igual aunque caiga martes: el
        # calendario laboral no manda esos días. El 2 de febrero de 2027 es
        # martes, y sin esto quedaba escondido bajo un día de semana cualquiera.
        f = max(f, 1.15)
    return f

# --- Procedencia ----------------------------------------------------------
REGIONES_PESO = [
    ("Ñuble", 0.30), ("Biobío", 0.22), ("Metropolitana de Santiago", 0.19),
    ("Maule", 0.11), ("Valparaíso", 0.05), ("La Araucanía", 0.045),
    ("Los Lagos", 0.02), ("Los Ríos", 0.015), ("O'Higgins", 0.02),
    ("Antofagasta", 0.008), ("Coquimbo", 0.012),
]
# Dentro de cada región no todas las comunas pesan igual: las capitales y las
# ciudades grandes son de donde realmente viene la gente a la costa de Ñuble.
COMUNAS_FRECUENTES = {
    "Ñuble": [("Chillán", 34), ("Chillán Viejo", 7), ("San Carlos", 11), ("Bulnes", 7),
              ("Quirihue", 9), ("Coelemu", 6), ("Trehuaco", 4), ("Ninhue", 3),
              ("Portezuelo", 3), ("Quillón", 4), ("Coihueco", 3), ("San Nicolás", 3),
              ("Yungay", 3), ("San Ignacio", 2), ("Ránquil", 2)],
    "Biobío": [("Concepción", 26), ("Talcahuano", 14), ("San Pedro de la Paz", 12),
               ("Chiguayante", 9), ("Los Ángeles", 9), ("Coronel", 7), ("Hualpén", 6),
               ("Penco", 5), ("Tomé", 5), ("Lota", 3), ("Cabrero", 2), ("Nacimiento", 2)],
    "Metropolitana de Santiago": [("Santiago", 16), ("Maipú", 10), ("Puente Alto", 9),
                                  ("La Florida", 8), ("Ñuñoa", 7), ("Las Condes", 7),
                                  ("Providencia", 6), ("Peñalolén", 5), ("San Bernardo", 5),
                                  ("Quilicura", 4), ("La Reina", 3), ("Macul", 3)],
    "Maule": [("Talca", 30), ("Cauquenes", 18), ("Linares", 13), ("Parral", 10),
              ("Curicó", 9), ("Constitución", 8), ("San Javier", 5), ("Chanco", 4)],
    "Valparaíso": [("Valparaíso", 10), ("Viña del Mar", 12), ("Quilpué", 6), ("Villa Alemana", 5)],
    "La Araucanía": [("Temuco", 20), ("Padre Las Casas", 7), ("Angol", 6), ("Villarrica", 5),
                     ("Victoria", 3)],
}

PAISES_EXTRANJEROS = [
    ("Argentina", 0.44), ("Brasil", 0.15), ("Estados Unidos", 0.08), ("España", 0.07),
    ("Francia", 0.06), ("Alemania", 0.05), ("Perú", 0.04), ("Canadá", 0.03),
    ("Australia", 0.03), ("Reino Unido", 0.025), ("Uruguay", 0.02), ("Colombia", 0.015),
]

def prob_extranjero(d):
    # El turista de afuera llega en enero y la primera quincena de febrero.
    if dt.date(2027, 1, 5) <= d <= dt.date(2027, 2, 15): return 0.12
    if d.month == 12 and d.day >= 26: return 0.07
    return 0.04

# --- Grupos ---------------------------------------------------------------
TIPOS = ["familia", "pareja", "amigos", "solo", "tour"]

def pesos_tipo(d):
    if d.month == 1 or (d.month == 2 and d.day <= 20):
        return [0.38, 0.26, 0.22, 0.09, 0.05]      # verano pleno: más familias
    if d.month == 3:
        return [0.24, 0.36, 0.22, 0.13, 0.05]      # marzo: parejas y escapadas
    return [0.34, 0.28, 0.22, 0.11, 0.05]

TAMANO = {
    "familia": lambda: rnd.choice([3, 3, 4, 4, 4, 5, 5, 6, 7]),
    "pareja":  lambda: 2,
    "amigos":  lambda: rnd.choice([3, 3, 4, 4, 5, 6]),
    "solo":    lambda: 1,
    "tour":    lambda: rnd.choice([8, 9, 10, 11, 12, 14, 16]),
}

RANGOS = ["edad_menor18", "edad_18_29", "edad_30_40", "edad_41_50", "edad_mayor50"]
PESOS_EDAD = {
    "familia": [0.35, 0.08, 0.28, 0.20, 0.09],
    "pareja":  [0.00, 0.25, 0.35, 0.25, 0.15],
    "amigos":  [0.02, 0.55, 0.28, 0.10, 0.05],
    "solo":    [0.00, 0.45, 0.30, 0.15, 0.10],
    "tour":    [0.10, 0.20, 0.25, 0.25, 0.20],
}

MOTIVOS = ["Ocio / vacaciones", "Surf", "Negocios", "Salud / bienestar",
           "Estudios", "Visita a familiares o amigos", "Evento / convención", "Otro"]
PESOS_MOTIVO = {
    "familia": [0.55, 0.06, 0.03, 0.05, 0.01, 0.22, 0.04, 0.04],
    "pareja":  [0.55, 0.15, 0.03, 0.06, 0.01, 0.15, 0.03, 0.02],
    "amigos":  [0.38, 0.38, 0.01, 0.02, 0.03, 0.12, 0.05, 0.01],
    "solo":    [0.20, 0.40, 0.10, 0.04, 0.06, 0.15, 0.03, 0.02],
    "tour":    [0.60, 0.04, 0.01, 0.06, 0.02, 0.08, 0.18, 0.01],
}

ATRACTIVOS_BASE = {
    "Lobería": 0.70, "Iglesia de Piedra": 0.62, "Buchupureo": 0.40, "Pullay": 0.28,
    "Centro Artesanal": 0.22, "Rinconada": 0.18, "Santa Rita": 0.16, "Trehualemu": 0.14,
    "Ecomuseo": 0.10, "Mela": 0.09, "Humedal Taucú": 0.08, "Cerro el Calvario": 0.08,
    "Monte Zorro": 0.07, "Humedal Colmuyao": 0.06, "Minimuseo": 0.06,
    "Parque las Nalkas": 0.06, "Parque los Avellanos": 0.05, "Fiesta de la Candelaria": 0.0,
}
SERVICIOS_BASE = {
    "Restaurantes": 0.68, "Cabañas": 0.40, "Oficinas de información turística": 0.25,
    "Campings": 0.22, "Buses": 0.18, "Guías turísticos": 0.12, "Hostales": 0.12,
    "Taxis": 0.09, "Tours Operadores": 0.08, "Hotel": 0.06, "Residencial": 0.05, "Lodge": 0.04,
}

def elegir(pares):
    """pares = [(valor, peso), ...]"""
    total = sum(p for _, p in pares)
    x = rnd.uniform(0, total)
    acum = 0.0
    for v, p in pares:
        acum += p
        if x <= acum:
            return v
    return pares[-1][0]

def elegir_idx(pesos):
    x = rnd.uniform(0, sum(pesos))
    acum = 0.0
    for i, p in enumerate(pesos):
        acum += p
        if x <= acum:
            return i
    return len(pesos) - 1

def main():
    comunas = json.load(open(os.path.join(AQUI, "comunas-chile.json"), encoding="utf-8"))

    registros = []
    n = 0
    d = INICIO
    while d <= FIN:
        cantidad = round(BASE_DIARIA * factor_periodo(d) * factor_dow(d) * rnd.uniform(0.86, 1.14))
        for _ in range(int(cantidad)):
            n += 1
            tipo = TIPOS[elegir_idx(pesos_tipo(d))]
            total = TAMANO[tipo]()

            # Motivo. En los días de la Candelaria el evento se come la agenda.
            pesos_m = list(PESOS_MOTIVO[tipo])
            if es_candelaria(d):
                pesos_m[6] *= 7.0
                pesos_m[0] *= 0.7
            motivo = MOTIVOS[elegir_idx(pesos_m)]

            # Edades: una por persona, así la suma calza con el total sí o sí.
            edades = dict((k, 0) for k in RANGOS)
            pesos_e = PESOS_EDAD[tipo]
            for _p in range(total):
                edades[RANGOS[elegir_idx(pesos_e)]] += 1

            # Sexo: el surf y los grupos de amigos se inclinan a masculino.
            p_fem = 0.38 if (motivo == "Surf" or tipo == "amigos") else 0.50
            fem = sum(1 for _p in range(total) if rnd.random() < p_fem)
            masc = total - fem

            # Procedencia
            if rnd.random() < prob_extranjero(d):
                pais = elegir(PAISES_EXTRANJEROS)
                region = comuna = ""
                procedencia = pais
            else:
                pais = "Chile"
                region = elegir(REGIONES_PESO)
                candidatas = COMUNAS_FRECUENTES.get(region)
                if candidatas:
                    comuna = elegir(candidatas)
                else:
                    comuna = rnd.choice(comunas.get(region, []))
                # Toda comuna tiene que existir en el selector de la app.
                assert comuna in comunas[region], "comuna fuera del catálogo: %s / %s" % (region, comuna)
                procedencia = comuna

            # Atractivos
            atractivos = []
            for a, p in ATRACTIVOS_BASE.items():
                if motivo == "Surf":
                    if a == "Buchupureo": p = 0.92
                    elif a == "Pullay": p = 0.45
                    elif a == "Lobería": p = 0.35
                if a == "Fiesta de la Candelaria":
                    p = 0.85 if es_candelaria(d) else 0.0
                if rnd.random() < p:
                    atractivos.append(a)
            if not atractivos:
                atractivos = ["Lobería"]
            rnd.shuffle(atractivos)
            atractivos = atractivos[:5]

            # Servicios
            servicios = []
            for s, p in SERVICIOS_BASE.items():
                if s == "Campings" and d.month == 1: p += 0.10
                if s == "Cabañas" and d.weekday() >= 4: p += 0.08
                if rnd.random() < p:
                    servicios.append(s)
            if not servicios:
                servicios = ["Restaurantes"]
            rnd.shuffle(servicios)
            servicios = servicios[:4]

            registros.append({
                # El prefijo "sim-" es la marca: si un registro lo tiene, NO es real.
                "id": "sim-%04d-%s" % (n, d.isoformat()),
                "fecha": d.isoformat(),
                "pais": pais,
                "region": region,
                "comuna": comuna,
                "procedencia": procedencia,
                "informador": elegir(INFORMADORES),
                "femenino": fem,
                "masculino": masc,
                "total": total,
                "edad_menor18": edades["edad_menor18"],
                "edad_18_29": edades["edad_18_29"],
                "edad_30_40": edades["edad_30_40"],
                "edad_41_50": edades["edad_41_50"],
                "edad_mayor50": edades["edad_mayor50"],
                "motivo": motivo,
                "atractivos": atractivos,
                "servicios": servicios,
            })
        d += dt.timedelta(days=1)

    registros.sort(key=lambda r: r["fecha"], reverse=True)
    salida = {"records": registros, "atractivosCustom": [], "serviciosCustom": []}
    destino = os.path.join(RAIZ, "seed-data.json")
    with open(destino, "w", encoding="utf-8") as f:
        # Compacto a propósito: el archivo lo descarga el navegador y nadie lo
        # lee a mano — se regenera con este script.
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print("%d registros escritos en %s" % (len(registros), destino))

if __name__ == "__main__":
    main()

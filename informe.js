"use strict";
/**
 * Genera el informe ejecutivo en Excel a partir de los registros.
 *
 * POR QUÉ VIVE EN EL SERVIDOR
 * El export anterior se armaba en el navegador con SheetJS, y la versión libre
 * de SheetJS NO escribe estilos de celda: ni colores, ni bordes, ni fuentes.
 * Por eso el archivo salía plano. ExcelJS sí los escribe, pero es una librería
 * de Node, así que el informe se arma acá y el navegador solo lo descarga.
 *
 * LO QUE ESTA LIBRERÍA NO PUEDE HACER
 * ExcelJS no genera gráficos nativos de Excel ni tablas dinámicas. El
 * "dashboard" se construye con lo que sí es nativo y además se recalcula solo:
 * un selector de mes con validación de datos, KPIs con fórmulas que dependen de
 * esa celda, y barras de datos por formato condicional. Al cambiar el mes en el
 * selector, todo el tablero responde dentro de Excel.
 */

const ExcelJS = require("exceljs");

// Paleta de la app, en el formato ARGB que usa Excel.
const C = {
  verde: "FF7DC040",
  verde600: "FF5A9A28",
  verde700: "FF3D7317",
  verde800: "FF264E0E",
  tinta: "FF14150E",
  papel: "FFF3EFE4",
  papel2: "FFE9E3D4",
  mostaza: "FFF2B33D",
  blanco: "FFFFFFFF",
  gris: "FF6B6558",
  linea: "FFD8D2C4",
  mar: "FF17655E",
  sombra: "FFC9C3B4",     // fila delgada bajo cada bloque: hace de sombra
  destacado: "FFEAF6DC",  // fondo de la fila #1 de cada ranking
};

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const fechaLarga = (iso) => {
  const [y,m,d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m-1]} de ${y}`;
};
// Dos formas del mismo mes: una para encabezados y selectores, otra para
// meterla dentro de una frase sin que quede "concentra Enero 2027".
const nombreMes = (ym) => {
  const [y,m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return `${MESES[m-1].charAt(0).toUpperCase()+MESES[m-1].slice(1)} ${y}`;
};
const mesEnFrase = (ym) => {
  const [y,m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return `${MESES[m-1]} de ${y}`;
};
const diaSemana = (iso) => {
  const [y,m,d] = String(iso).split("-").map(Number);
  const f = new Date(y, (m||1)-1, d||1);
  return isNaN(f.getTime()) ? "" : DIAS[(f.getDay()+6)%7];
};
const num = (n) => Number(n||0).toLocaleString("es-CL");
const plural = (n, sing, plu) => `${num(n)} ${n === 1 ? sing : plu}`;
const pct = (parte, total) => total ? (parte/total*100) : 0;
const pctTxt = (parte, total) => pct(parte,total).toFixed(1).replace(".", ",") + "%";

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------
function analizar(records) {
  const a = { n: records.length };
  a.turistas = records.reduce((s,r)=>s+(r.total||0), 0);
  a.femenino = records.reduce((s,r)=>s+(r.femenino||0), 0);
  a.masculino = records.reduce((s,r)=>s+(r.masculino||0), 0);
  a.grupoMedio = a.n ? a.turistas/a.n : 0;

  const fechas = records.map(r=>r.fecha).filter(Boolean).sort();
  a.desde = fechas[0] || "";
  a.hasta = fechas[fechas.length-1] || "";
  a.diasConRegistro = new Set(fechas).size;

  const cuenta = (fn) => {
    const m = {};
    records.forEach(r => { const k = fn(r); if (k) m[k] = (m[k]||0) + 1; });
    return Object.entries(m).sort((x,y)=>y[1]-x[1]);
  };
  const suma = (fn, campo) => {
    const m = {};
    records.forEach(r => { const k = fn(r); if (k) m[k] = (m[k]||0) + (r[campo]||0); });
    return Object.entries(m).sort((x,y)=>y[1]-x[1]);
  };

  a.porMes = suma(r=>String(r.fecha||"").slice(0,7), "total").sort((x,y)=>x[0]<y[0]?-1:1);
  a.porMesTop = [...a.porMes].sort((x,y)=>y[1]-x[1]);
  a.porDiaSemana = DIAS.map(d => [d, records.filter(r=>diaSemana(r.fecha)===d).reduce((s,r)=>s+(r.total||0),0)]);
  a.porDiaSemanaTop = [...a.porDiaSemana].sort((x,y)=>y[1]-x[1]);
  a.porFecha = suma(r=>r.fecha, "total").sort((x,y)=>y[1]-x[1]);
  a.porRegion = cuenta(r => (r.pais && r.pais !== "Chile") ? "Extranjero" : (r.region || "Sin especificar"));
  a.porProcedencia = cuenta(r => r.procedencia);
  a.porMotivo = cuenta(r => r.motivo);
  a.extranjeros = records.filter(r => r.pais && r.pais !== "Chile").length;
  a.porPais = cuenta(r => (r.pais && r.pais !== "Chile") ? r.pais : null);

  const listar = (campo) => {
    const m = {};
    records.forEach(r => (r[campo]||[]).forEach(v => { m[v] = (m[v]||0)+1; }));
    return Object.entries(m).sort((x,y)=>y[1]-x[1]);
  };
  a.atractivos = listar("atractivos");
  a.servicios = listar("servicios");

  a.edades = [
    ["Menor de 18", records.reduce((s,r)=>s+(r.edad_menor18||0),0)],
    ["18 a 29",     records.reduce((s,r)=>s+(r.edad_18_29||0),0)],
    ["30 a 40",     records.reduce((s,r)=>s+(r.edad_30_40||0),0)],
    ["41 a 50",     records.reduce((s,r)=>s+(r.edad_41_50||0),0)],
    ["Mayor de 50", records.reduce((s,r)=>s+(r.edad_mayor50||0),0)],
  ];
  a.edadesTop = [...a.edades].sort((x,y)=>y[1]-x[1]);
  a.informadores = cuenta(r => r.informador);
  return a;
}

// ---------------------------------------------------------------------------
// Narrativa: el análisis contado en palabras, no en tablas
// ---------------------------------------------------------------------------
function narrar(a) {
  const s = [];
  const jornada = a.diasConRegistro ? (a.turistas/a.diasConRegistro) : 0;

  s.push({
    titulo: "1. Cuánta gente llegó, y cuándo",
    texto:
      `Entre el ${fechaLarga(a.desde)} y el ${fechaLarga(a.hasta)} se atendieron ${plural(a.n,"grupo","grupos")}, ` +
      `que suman ${plural(a.turistas,"turista","turistas")}. Eso da un promedio de ${jornada.toFixed(1).replace(".",",")} personas por jornada ` +
      `a lo largo de ${plural(a.diasConRegistro,"día","días")} con actividad registrada.\n\n` +
      (a.porMesTop.length > 1
        ? `El movimiento no se reparte parejo: ${mesEnFrase(a.porMesTop[0][0])} concentra ${num(a.porMesTop[0][1])} turistas, ` +
          `el ${pctTxt(a.porMesTop[0][1], a.turistas)} de todo el período, mientras que ${mesEnFrase(a.porMesTop[a.porMesTop.length-1][0])} ` +
          `apenas llega a ${num(a.porMesTop[a.porMesTop.length-1][1])}. Esa diferencia es la que manda a la hora de decidir cuándo ` +
          `reforzar personal y cuándo conviene hacer mantención.`
        : `Todo el período registrado se concentra en un solo mes, así que todavía no hay base para hablar de estacionalidad.`),
  });

  const diaTop = a.porDiaSemanaTop[0], diaBajo = a.porDiaSemanaTop[a.porDiaSemanaTop.length-1];
  const peak = a.porFecha[0];
  s.push({
    titulo: "2. Qué días de la semana llega más gente",
    texto:
      (diaTop && diaTop[1]
        ? `El día más fuerte es el ${diaTop[0].toLowerCase()}, con ${num(diaTop[1])} turistas acumulados, ` +
          `y el más tranquilo es el ${diaBajo[0].toLowerCase()}, con ${num(diaBajo[1])}. ` +
          `El ${diaTop[0].toLowerCase()} mueve ${(diaTop[1]/(diaBajo[1]||1)).toFixed(1).replace(".",",")} veces lo que mueve el ${diaBajo[0].toLowerCase()}.\n\n`
        : "") +
      (peak
        ? `La fecha con mayor afluencia fue el ${fechaLarga(peak[0])}, con ${num(peak[1])} turistas en un solo día.\n\n`
        : "") +
      `Una advertencia para leer este cuadro: los eventos puntuales lo distorsionan. Si una fiesta cae un martes, ` +
      `ese martes sube y contamina el promedio semanal. Conviene mirarlo junto con el detalle por fecha.`,
  });

  const regTop = a.porRegion[0], procTop = a.porProcedencia[0];
  s.push({
    titulo: "3. De dónde viene el turista",
    texto:
      (regTop
        ? `La mayor parte llega de ${regTop[0]}: ${num(regTop[1])} grupos, el ${pctTxt(regTop[1], a.n)} del total. `
        : "") +
      (procTop ? `La comuna que más aporta es ${procTop[0]}, con ${num(procTop[1])} grupos. ` : "") +
      `El turismo extranjero representa el ${pctTxt(a.extranjeros, a.n)} de los registros` +
      (a.porPais.length ? `, encabezado por ${a.porPais[0][0]}` : "") + `.\n\n` +
      `Esto define dónde tiene sentido invertir en difusión. Un público mayoritariamente regional se capta con radio local, ` +
      `redes y convenios cercanos; uno de origen lejano exige otra estrategia y otro presupuesto.`,
  });

  const edadTop = a.edadesTop[0];
  s.push({
    titulo: "4. Quiénes son",
    texto:
      `La composición por sexo es de ${pctTxt(a.femenino, a.turistas)} femenino y ${pctTxt(a.masculino, a.turistas)} masculino. ` +
      (edadTop ? `El tramo de edad predominante es el de ${edadTop[0].toLowerCase()}, con el ${pctTxt(edadTop[1], a.turistas)} de las personas. ` : "") +
      `El grupo promedio es de ${a.grupoMedio.toFixed(1).replace(".",",")} personas.\n\n` +
      `El tamaño del grupo es un dato operativo concreto: define capacidad de mesas, cabañas y tours. ` +
      `Un promedio cercano a dos habla de parejas; sobre cuatro, de familias.`,
  });

  const motTop = a.porMotivo[0];
  s.push({
    titulo: "5. Por qué vienen",
    texto:
      (motTop
        ? `El motivo declarado con más frecuencia es "${motTop[0]}", en el ${pctTxt(motTop[1], a.n)} de los registros. `
        : "") +
      (a.porMotivo[1] ? `Le sigue "${a.porMotivo[1][0]}" con el ${pctTxt(a.porMotivo[1][1], a.n)}. ` : "") +
      `\n\nEl motivo es la puerta de entrada a la oferta: no se le vende lo mismo a quien viene a descansar que a quien ` +
      `viene a correr olas o a visitar familia. Si un motivo minoritario crece temporada a temporada, ahí hay un nicho abriéndose.`,
  });

  const atrTop = a.atractivos[0], srvTop = a.servicios[0];
  s.push({
    titulo: "6. Qué preguntan y qué usan",
    texto:
      (atrTop ? `El atractivo más consultado es ${atrTop[0]}, mencionado en el ${pctTxt(atrTop[1], a.n)} de las atenciones. ` : "") +
      (a.atractivos[1] ? `Después aparece ${a.atractivos[1][0]} (${pctTxt(a.atractivos[1][1], a.n)}). ` : "") +
      (srvTop ? `\n\nEntre los servicios, el más requerido es ${srvTop[0]}, con el ${pctTxt(srvTop[1], a.n)}. ` : "") +
      `\n\nLos últimos lugares de estas dos listas son tan informativos como los primeros: un atractivo que casi nadie ` +
      `menciona o no está siendo difundido, o no está en condiciones de recibir gente. Vale la pena revisar cuál de las dos cosas es.`,
  });

  return s;
}

function concluir(a) {
  const mesTop = a.porMesTop[0], diaTop = a.porDiaSemanaTop[0];
  const regTop = a.porRegion[0], motTop = a.porMotivo[0], atrTop = a.atractivos[0];
  const partes = [];
  partes.push(`En el período analizado se registraron ${plural(a.turistas,"turista","turistas")} en ${plural(a.n,"atención","atenciones")}.`);
  if (mesTop) partes.push(`La temporada se concentra en ${mesEnFrase(mesTop[0])}, que por sí solo explica el ${pctTxt(mesTop[1], a.turistas)} del movimiento.`);
  if (diaTop) partes.push(`Dentro de la semana, el ${diaTop[0].toLowerCase()} es el día de mayor afluencia.`);
  if (regTop) partes.push(`El visitante típico viene de ${regTop[0]}`);
  if (motTop) partes[partes.length-1] += `, declara "${motTop[0]}" como motivo`;
  if (atrTop) partes[partes.length-1] += ` y pregunta por ${atrTop[0]}`;
  partes[partes.length-1] += ".";
  partes.push(
    `Con esto ya se puede planificar personal y horarios con base en datos y no en impresiones. ` +
    `Lo que este registro todavía no captura —y es lo que convertiría estas cifras en un argumento de inversión— ` +
    `es cuánto dinero deja cada visitante y qué buscó sin encontrar.`
  );
  return partes.join(" ");
}

// ---------------------------------------------------------------------------
// Construcción del archivo
//
// La profundidad en Excel no se logra con sombras (no existen para celdas): se
// logra con tres recursos que sí son nativos y que aquí se usan juntos —
// degradados de relleno, bordes asimétricos (claro arriba/izquierda, oscuro
// abajo/derecha) y una fila delgada de gris bajo cada bloque que el ojo lee
// como sombra proyectada.
// ---------------------------------------------------------------------------
function borde(color = C.linea, style = "thin") {
  return { top:{style,color:{argb:color}}, left:{style,color:{argb:color}},
           bottom:{style,color:{argb:color}}, right:{style,color:{argb:color}} };
}

/** Bordes que simulan una superficie elevada: luz arriba, sombra abajo. */
function relieve(claro = C.blanco, oscuro = C.linea) {
  return {
    top:    { style:"thin",   color:{argb:claro} },
    left:   { style:"thin",   color:{argb:claro} },
    bottom: { style:"medium", color:{argb:oscuro} },
    right:  { style:"medium", color:{argb:oscuro} },
  };
}

function degradado(desde, hasta, vertical = true) {
  return {
    type:"gradient", gradient:"angle", degree: vertical ? 90 : 0,
    stops:[{position:0,color:{argb:desde}},{position:1,color:{argb:hasta}}],
  };
}

/** Fila delgada que hace de sombra bajo un bloque. */
function sombra(ws, fila, desdeCol, hastaCol, alto = 3.5) {
  for (let c = desdeCol; c <= hastaCol; c++) {
    ws.getCell(fila, c).fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.sombra} };
  }
  ws.getRow(fila).height = alto;
}

function tituloSeccion(ws, fila, texto, desdeCol = 1, hastaCol = 4) {
  ws.mergeCells(fila, desdeCol, fila, hastaCol);
  const c = ws.getCell(fila, desdeCol);
  c.value = texto;
  c.font = { name:"Calibri", size:11.5, bold:true, color:{argb:C.blanco} };
  c.fill = degradado(C.verde800, C.verde600);
  c.alignment = { vertical:"middle", indent:1 };
  c.border = relieve(C.verde600, C.tinta);
  ws.getRow(fila).height = 24;
  sombra(ws, fila+1, desdeCol, hastaCol, 2.5);
  return fila + 2;
}

function encabezadoTabla(ws, fila, cols, desdeCol = 1) {
  cols.forEach((t, i) => {
    const c = ws.getCell(fila, desdeCol + i);
    c.value = t;
    c.font = { name:"Calibri", size:9.5, bold:true, color:{argb:C.blanco} };
    c.fill = degradado(C.tinta, C.verde800);
    c.alignment = { vertical:"middle", horizontal: i===0 ? "left" : "center", indent: i===0 ? 1 : 0 };
    c.border = { top:{style:"thin",color:{argb:C.verde600}}, bottom:{style:"medium",color:{argb:C.tinta}},
                 left:{style:"thin",color:{argb:C.verde800}}, right:{style:"thin",color:{argb:C.verde800}} };
  });
  ws.getRow(fila).height = 20;
  return fila + 1;
}

/** Tarjeta elevada con una cifra. Ocupa 4 filas desde `fila`. */
function tarjetaKPI(ws, fila, col, titulo, valor, fmt, acento = C.verde) {
  const cAcento = ws.getCell(fila, col);
  cAcento.fill = degradado(acento, acento);
  cAcento.border = { top:{style:"thin",color:{argb:acento}}, left:{style:"thin",color:{argb:acento}}, right:{style:"thin",color:{argb:acento}} };
  ws.getRow(fila).height = 5;

  const cTit = ws.getCell(fila+1, col);
  cTit.value = titulo;
  cTit.font = { name:"Calibri", size:8.5, bold:true, color:{argb:C.verde700} };
  cTit.alignment = { horizontal:"center", vertical:"bottom" };
  cTit.fill = degradado(C.blanco, C.papel);
  cTit.border = { left:{style:"thin",color:{argb:C.blanco}}, right:{style:"medium",color:{argb:C.linea}} };
  ws.getRow(fila+1).height = 15;

  const cVal = ws.getCell(fila+2, col);
  if (typeof valor === "object" && valor.formula) cVal.value = valor;
  else cVal.value = valor;
  if (fmt) cVal.numFmt = fmt;
  cVal.font = { name:"Calibri", size:22, bold:true, color:{argb:C.tinta} };
  cVal.alignment = { horizontal:"center", vertical:"top" };
  cVal.fill = degradado(C.papel, C.papel2);
  cVal.border = { left:{style:"thin",color:{argb:C.blanco}}, right:{style:"medium",color:{argb:C.linea}}, bottom:{style:"medium",color:{argb:C.linea}} };
  ws.getRow(fila+2).height = 30;

  ws.getCell(fila+3, col).fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.sombra} };
  ws.getRow(fila+3).height = 3;
}

/** Tabla de ranking con % y barra de datos. */
function tablaRanking(ws, fila, titulo, entradas, denom, etiquetaDenom, limite = 12) {
  fila = tituloSeccion(ws, fila, titulo, 1, 4);
  fila = encabezadoTabla(ws, fila, ["Categoría", "Cantidad", "% " + etiquetaDenom, "Peso relativo"]);
  const desde = fila;
  const lista = entradas.slice(0, limite);
  lista.forEach((e, i) => {
    const primero = i === 0;
    const par = i % 2 === 0;
    const celdas = [e[0], e[1], denom ? e[1]/denom : 0, e[1]];
    celdas.forEach((v, j) => {
      const c = ws.getCell(fila, j+1);
      c.value = v;
      c.border = {
        top:{style:"hair",color:{argb:C.blanco}},
        bottom:{style:"hair",color:{argb:C.linea}},
        left:{style:"hair",color:{argb:C.linea}},
        right:{style:"hair",color:{argb:C.linea}},
      };
      c.fill = primero ? degradado(C.destacado, C.papel2)
                       : { type:"pattern", pattern:"solid", fgColor:{argb: par ? C.blanco : C.papel} };
      c.font = { name:"Calibri", size:10, color:{argb:C.tinta}, bold: primero };
      if (j === 0) c.alignment = { indent:1, vertical:"middle" };
      if (j === 1) { c.numFmt = "#,##0"; c.alignment = { horizontal:"center", vertical:"middle" }; }
      if (j === 2) { c.numFmt = "0.0%"; c.alignment = { horizontal:"center", vertical:"middle" }; }
      if (j === 3) c.font = { name:"Calibri", size:10, color:{argb: primero ? C.destacado : (par ? C.blanco : C.papel)} };
    });
    ws.getRow(fila).height = 17;
    fila++;
  });
  if (lista.length) {
    ws.addConditionalFormatting({
      ref: `D${desde}:D${fila-1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde600}, gradient:true }],
    });
  }
  sombra(ws, fila, 1, 4, 3);
  fila++;
  if (entradas.length > limite) {
    const c = ws.getCell(fila, 1);
    c.value = `Se muestran las ${limite} principales de ${entradas.length}. El detalle completo está en la hoja "Datos".`;
    c.font = { name:"Calibri", size:8.5, italic:true, color:{argb:C.gris} };
    ws.mergeCells(fila, 1, fila, 4);
    fila++;
  }
  return fila + 1;
}

function hojaResumen(wb, a, secciones, conclusion) {
  const ws = wb.addWorksheet("Resumen ejecutivo", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3} },
  });
  ws.columns = [{width:2},{width:17},{width:1.6},{width:17},{width:1.6},{width:17},{width:1.6},{width:17},{width:2}];

  // ---- Portada: degradado vertical de la arena negra al verde institucional
  for (let f = 2; f <= 7; f++) {
    for (let col = 2; col <= 8; col++) {
      ws.getCell(f, col).fill = degradado(C.tinta, C.verde800);
    }
  }
  ws.mergeCells("B2:H4");
  const t = ws.getCell("B2");
  t.value = "Registro de Turistas";
  t.font = { name:"Calibri Light", size:32, bold:true, color:{argb:C.blanco} };
  t.alignment = { vertical:"middle", indent:1 };
  ws.getRow(2).height = 26; ws.getRow(3).height = 26; ws.getRow(4).height = 14;

  ws.mergeCells("B5:H5");
  const st = ws.getCell("B5");
  st.value = "I. MUNICIPALIDAD DE COBQUECURA  ·  LA COSTA DE ÑUBLE";
  st.font = { name:"Calibri", size:10, bold:true, color:{argb:C.verde} };
  st.alignment = { indent:1 };
  ws.getRow(5).height = 18;

  ws.mergeCells("B6:H6");
  const pe = ws.getCell("B6");
  pe.value = a.desde ? `Informe del período  ${fechaLarga(a.desde)}  al  ${fechaLarga(a.hasta)}` : "Informe de temporada";
  pe.font = { name:"Calibri", size:9.5, color:{argb:C.papel2} };
  pe.alignment = { indent:1, vertical:"top" };
  ws.getRow(6).height = 16;
  ws.getRow(7).height = 6;

  // Banda de acento bajo la portada + su sombra
  for (let col = 2; col <= 8; col++) ws.getCell(8, col).fill = degradado(C.verde, C.mostaza, false);
  ws.getRow(8).height = 5;
  sombra(ws, 9, 2, 8, 4);

  // ---- Cifras principales, en tarjetas elevadas
  let fila = 11;
  const kpis = [
    ["TURISTAS ATENDIDOS", a.turistas, "#,##0", C.verde],
    ["ATENCIONES", a.n, "#,##0", C.mar],
    ["GRUPO PROMEDIO", a.grupoMedio, "0.0", C.mostaza],
    ["DÍAS CON ACTIVIDAD", a.diasConRegistro, "#,##0", C.verde700],
  ];
  kpis.forEach((k, i) => tarjetaKPI(ws, fila, 2 + i*2, k[0], k[1], k[2], k[3]));
  fila += 5;

  // ---- Análisis narrativo
  secciones.forEach(sec => {
    ws.mergeCells(fila, 2, fila, 8);
    const h = ws.getCell(fila, 2);
    h.value = "   " + sec.titulo;
    h.font = { name:"Calibri", size:12, bold:true, color:{argb:C.blanco} };
    h.fill = degradado(C.verde800, C.verde600);
    h.alignment = { vertical:"middle" };
    h.border = relieve(C.verde600, C.tinta);
    ws.getRow(fila).height = 22;
    sombra(ws, fila+1, 2, 8, 2.5);
    fila += 2;

    ws.mergeCells(fila, 2, fila, 8);
    const p = ws.getCell(fila, 2);
    p.value = sec.texto;
    p.font = { name:"Calibri", size:10, color:{argb:C.tinta} };
    p.alignment = { wrapText:true, vertical:"top", indent:1 };
    p.fill = degradado(C.blanco, C.papel);
    p.border = { left:{style:"thick",color:{argb:C.verde}}, bottom:{style:"thin",color:{argb:C.linea}}, right:{style:"thin",color:{argb:C.linea}} };
    // El ancho útil da unos 88 caracteres por línea. Subestimarlo corta el último
    // renglón, y en Excel eso no se nota hasta abrir el archivo.
    const lineas = sec.texto.split("\n").reduce((acc,l)=>acc + Math.max(1, Math.ceil(l.length/88)), 0);
    ws.getRow(fila).height = Math.max(38, lineas * 14.5 + 8);
    fila++;
    sombra(ws, fila, 2, 8, 3);
    fila += 2;
  });

  // ---- Conclusión
  ws.mergeCells(fila, 2, fila, 8);
  const ct = ws.getCell(fila, 2);
  ct.value = "   EN RESUMEN";
  ct.font = { name:"Calibri", size:12.5, bold:true, color:{argb:C.tinta} };
  ct.fill = degradado(C.mostaza, C.verde);
  ct.alignment = { vertical:"middle" };
  ct.border = relieve(C.mostaza, C.verde800);
  ws.getRow(fila).height = 24;
  sombra(ws, fila+1, 2, 8, 2.5);
  fila += 2;

  ws.mergeCells(fila, 2, fila, 8);
  const cc = ws.getCell(fila, 2);
  cc.value = conclusion;
  cc.font = { name:"Calibri", size:10.5, color:{argb:C.tinta} };
  cc.alignment = { wrapText:true, vertical:"top", indent:1 };
  cc.fill = degradado(C.papel, C.papel2);
  cc.border = { left:{style:"thick",color:{argb:C.mostaza}}, bottom:{style:"medium",color:{argb:C.linea}}, right:{style:"thin",color:{argb:C.linea}} };
  ws.getRow(fila).height = Math.max(70, Math.ceil(conclusion.length/88) * 15 + 10);
  fila++;
  sombra(ws, fila, 2, 8, 3.5);
  fila += 2;

  const pie = ws.getCell(fila, 2);
  pie.value = "Informe generado automáticamente por la aplicación Registro de Turistas.";
  pie.font = { name:"Calibri", size:8.5, italic:true, color:{argb:C.gris} };
  ws.mergeCells(fila, 2, fila, 8);
  return ws;
}

function hojaDashboard(wb, a, nFilas) {
  const ws = wb.addWorksheet("Dashboard", { views:[{ showGridLines:false }] });
  ws.columns = [{width:2},{width:26},{width:1.6},{width:15},{width:1.6},{width:15},{width:1.6},{width:15},{width:2}];
  const F = nFilas + 1;

  for (let f = 2; f <= 3; f++) for (let col = 2; col <= 8; col++) ws.getCell(f, col).fill = degradado(C.tinta, C.verde800);
  ws.mergeCells("B2:H2");
  const t = ws.getCell("B2");
  t.value = "  TABLERO DE CONTROL";
  t.font = { name:"Calibri Light", size:20, bold:true, color:{argb:C.blanco} };
  t.alignment = { vertical:"middle" };
  ws.getRow(2).height = 34;
  ws.mergeCells("B3:H3");
  const ay = ws.getCell("B3");
  ay.value = "  Elige un período en la casilla verde: todas las cifras de esta hoja se recalculan solas.";
  ay.font = { name:"Calibri", size:9, italic:true, color:{argb:C.papel2} };
  ws.getRow(3).height = 15;
  for (let col = 2; col <= 8; col++) ws.getCell(4, col).fill = degradado(C.verde, C.mostaza, false);
  ws.getRow(4).height = 4;
  sombra(ws, 5, 2, 8, 4);

  // Selector con aspecto de botón: degradado y bordes de relieve.
  const lbl = ws.getCell(7, 2);
  lbl.value = "PERÍODO";
  lbl.font = { name:"Calibri", size:9, bold:true, color:{argb:C.verde700} };
  lbl.alignment = { vertical:"middle", horizontal:"right" };
  const meses = a.porMes.map(m => nombreMes(m[0]));
  const opciones = ["Toda la temporada", ...meses];
  ws.mergeCells(7, 4, 7, 6);
  const sel = ws.getCell(7, 4);
  sel.value = "Toda la temporada";
  sel.dataValidation = {
    type:"list", allowBlank:false, formulae:[`"${opciones.join(",")}"`],
    showErrorMessage:true, errorTitle:"Período no válido", error:"Elige uno de los períodos de la lista.",
  };
  sel.font = { name:"Calibri", size:11.5, bold:true, color:{argb:C.tinta} };
  sel.fill = degradado(C.verde, C.verde600);
  sel.border = relieve(C.destacado, C.verde800);
  sel.alignment = { horizontal:"center", vertical:"middle" };
  ws.getRow(7).height = 26;
  for (let col = 4; col <= 6; col++) ws.getCell(8, col).fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.sombra} };
  ws.getRow(8).height = 3;

  const todo = `$D$7="Toda la temporada"`;
  const kpis = [
    ["TURISTAS",   `IF(${todo},SUM(Datos!J2:J${F}),SUMIF(Datos!B2:B${F},$D$7,Datos!J2:J${F}))`, "#,##0", C.verde],
    ["ATENCIONES", `IF(${todo},COUNTA(Datos!A2:A${F}),COUNTIF(Datos!B2:B${F},$D$7))`, "#,##0", C.mar],
    ["FEMENINO",   `IFERROR(IF(${todo},SUM(Datos!H2:H${F}),SUMIF(Datos!B2:B${F},$D$7,Datos!H2:H${F}))/$B$12,0)`, "0.0%", C.mostaza],
    ["GRUPO MEDIO",`IFERROR($B$12/$D$12,0)`, "0.0", C.verde700],
  ];
  kpis.forEach((k, i) => tarjetaKPI(ws, 10, 2 + i*2, k[0], { formula:k[1] }, k[2], k[3]));

  let fila = 15;
  const tablaViva = (titulo, etiquetas, colDatos) => {
    fila = tituloSeccion(ws, fila, titulo, 2, 8);
    fila = encabezadoTabla(ws, fila, ["Categoría", "Turistas", "% del período", "Peso relativo"], 2);
    const desde = fila;
    etiquetas.forEach((et, i) => {
      const f = fila;
      const par = i % 2 === 0;
      ws.getCell(f, 2).value = et;
      ws.getCell(f, 4).value = { formula: `IF(${todo},SUMIF(Datos!${colDatos}2:${colDatos}${F},$B${f},Datos!$J2:$J${F}),SUMIFS(Datos!$J2:$J${F},Datos!${colDatos}2:${colDatos}${F},$B${f},Datos!$B2:$B${F},$D$7))` };
      ws.getCell(f, 4).numFmt = "#,##0";
      ws.getCell(f, 6).value = { formula: `IFERROR($D${f}/$B$12,0)` };
      ws.getCell(f, 6).numFmt = "0.0%";
      ws.getCell(f, 8).value = { formula: `$D${f}` };
      [2,4,6,8].forEach((col, j) => {
        const c = ws.getCell(f, col);
        c.border = { top:{style:"hair",color:{argb:C.blanco}}, bottom:{style:"hair",color:{argb:C.linea}},
                     left:{style:"hair",color:{argb:C.linea}}, right:{style:"hair",color:{argb:C.linea}} };
        c.fill = { type:"pattern", pattern:"solid", fgColor:{argb: par ? C.blanco : C.papel} };
        c.font = { name:"Calibri", size:10, color:{argb: j===3 ? (par?C.blanco:C.papel) : C.tinta} };
        if (j === 0) c.alignment = { indent:1, vertical:"middle" };
        else c.alignment = { horizontal:"center", vertical:"middle" };
      });
      // Las columnas estrechas intermedias siguen el color de la fila.
      [3,5,7].forEach(col => {
        ws.getCell(f, col).fill = { type:"pattern", pattern:"solid", fgColor:{argb: par ? C.blanco : C.papel} };
      });
      ws.getRow(f).height = 17;
      fila++;
    });
    ws.addConditionalFormatting({
      ref: `H${desde}:H${fila-1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde600}, gradient:true }],
    });
    sombra(ws, fila, 2, 8, 3);
    fila += 2;
  };

  tablaViva("AFLUENCIA POR DÍA DE LA SEMANA", DIAS, "C");
  tablaViva("ORIGEN DEL VISITANTE", a.porRegion.slice(0, 10).map(r=>r[0]), "E");
  tablaViva("MOTIVO DEL VIAJE", a.porMotivo.slice(0, 8).map(r=>r[0]), "P");
  return ws;
}

function hojaAnalisis(wb, a) {
  const ws = wb.addWorksheet("Análisis", { views:[{ showGridLines:false }] });
  ws.columns = [{width:34},{width:13},{width:14},{width:18},{width:3}];
  for (let col = 1; col <= 4; col++) ws.getCell(1, col).fill = degradado(C.tinta, C.verde800);
  ws.mergeCells("A1:D1");
  const t = ws.getCell("A1");
  t.value = "  ANÁLISIS POR DIMENSIÓN";
  t.font = { name:"Calibri Light", size:17, bold:true, color:{argb:C.blanco} };
  t.alignment = { vertical:"middle" };
  ws.getRow(1).height = 30;
  for (let col = 1; col <= 4; col++) ws.getCell(2, col).fill = degradado(C.verde, C.mostaza, false);
  ws.getRow(2).height = 4;
  sombra(ws, 3, 1, 4, 4);

  let fila = 5;
  fila = tablaRanking(ws, fila, "TURISTAS POR MES", a.porMesTop.map(m=>[nombreMes(m[0]), m[1]]), a.turistas, "de los turistas");
  fila = tablaRanking(ws, fila, "TURISTAS POR DÍA DE LA SEMANA", a.porDiaSemanaTop, a.turistas, "de los turistas", 7);
  fila = tablaRanking(ws, fila, "FECHAS DE MAYOR AFLUENCIA", a.porFecha.slice(0,10).map(f=>[fechaLarga(f[0]), f[1]]), a.turistas, "de los turistas", 10);
  fila = tablaRanking(ws, fila, "COMPOSICIÓN POR EDAD", a.edadesTop, a.turistas, "de los turistas", 5);
  fila = tablaRanking(ws, fila, "ORIGEN DEL VISITANTE", a.porRegion, a.n, "de los registros");
  fila = tablaRanking(ws, fila, "COMUNAS Y PAÍSES DE PROCEDENCIA", a.porProcedencia, a.n, "de los registros", 15);
  fila = tablaRanking(ws, fila, "MOTIVO DEL VIAJE", a.porMotivo, a.n, "de los registros", 10);
  fila = tablaRanking(ws, fila, "ATRACTIVOS MÁS CONSULTADOS", a.atractivos, a.n, "de los registros", 15);
  fila = tablaRanking(ws, fila, "SERVICIOS MÁS REQUERIDOS", a.servicios, a.n, "de los registros", 15);
  if (a.informadores.length) fila = tablaRanking(ws, fila, "REGISTROS POR INFORMADOR", a.informadores, a.n, "de los registros", 10);
  return ws;
}

function hojaDatos(wb, records) {
  const ws = wb.addWorksheet("Datos", { views:[{ state:"frozen", ySplit:1 }] });
  const cols = [
    ["Fecha", 12], ["Mes", 15], ["Día", 12], ["País", 16], ["Región", 22], ["Procedencia", 20],
    ["Informador", 18], ["Femenino", 10], ["Masculino", 10], ["Total", 8],
    ["Menor de 18", 12], ["18 a 29", 10], ["30 a 40", 10], ["41 a 50", 10], ["Mayor de 50", 12],
    ["Motivo", 26], ["Atractivos", 40], ["Servicios", 40],
  ];
  ws.columns = cols.map(c => ({ width: c[1] }));
  cols.forEach((c, i) => {
    const cell = ws.getCell(1, i+1);
    cell.value = c[0];
    cell.font = { name:"Calibri", size:10, bold:true, color:{argb:C.blanco} };
    cell.fill = degradado(C.tinta, C.verde800);
    cell.alignment = { vertical:"middle", horizontal:"center" };
    cell.border = { top:{style:"thin",color:{argb:C.verde600}}, bottom:{style:"medium",color:{argb:C.tinta}},
                    left:{style:"thin",color:{argb:C.verde800}}, right:{style:"thin",color:{argb:C.verde800}} };
  });
  ws.getRow(1).height = 24;

  records.forEach((r, i) => {
    const f = i + 2;
    const fila = [
      r.fecha, nombreMes(String(r.fecha||"").slice(0,7)), diaSemana(r.fecha),
      r.pais||"", r.region||"", r.procedencia||"", r.informador||"",
      r.femenino||0, r.masculino||0, r.total||0,
      r.edad_menor18||0, r.edad_18_29||0, r.edad_30_40||0, r.edad_41_50||0, r.edad_mayor50||0,
      r.motivo||"", (r.atractivos||[]).join(" · "), (r.servicios||[]).join(" · "),
    ];
    fila.forEach((v, j) => {
      const c = ws.getCell(f, j+1);
      c.value = v;
      c.font = { name:"Calibri", size:9.5, color:{argb:C.tinta} };
      c.border = { bottom:{style:"hair",color:{argb:C.linea}}, right:{style:"hair",color:{argb:C.linea}} };
      c.fill = { type:"pattern", pattern:"solid", fgColor:{argb: i % 2 ? C.papel : C.blanco} };
      if (j >= 7 && j <= 14) { c.numFmt = "#,##0"; c.alignment = { horizontal:"center" }; }
      if (j === 9) c.font = { name:"Calibri", size:9.5, bold:true, color:{argb:C.verde800} };
    });
    ws.getRow(f).height = 15;
  });
  ws.autoFilter = { from:{row:1,column:1}, to:{row:records.length+1, column:cols.length} };
  if (records.length) {
    ws.addConditionalFormatting({
      ref: `J2:J${records.length+1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde}, gradient:true }],
    });
  }
  return ws;
}

/** Construye el informe completo y devuelve el buffer del .xlsx. */
async function generarInforme(records) {
  const a = analizar(records);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro de Turistas — I. Municipalidad de Cobquecura";
  wb.created = new Date();

  hojaResumen(wb, a, narrar(a), concluir(a));
  hojaDashboard(wb, a, records.length);
  hojaAnalisis(wb, a);
  hojaDatos(wb, records);

  return wb.xlsx.writeBuffer();
}

module.exports = { generarInforme, analizar, narrar, concluir };

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
  alerta: "FFA63D2F",
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
// AAAAMM como número. El tablero compara contra esto y no contra el texto del
// mes: si el usuario escribe una fecha en el selector, Excel la guarda como
// número y la comparación de texto fallaba en silencio, mostrando ceros.
const mesNumero = (fecha) => {
  const s = String(fecha||"");
  const y = Number(s.slice(0,4)), m = Number(s.slice(5,7));
  return (y && m) ? y*100 + m : 0;
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
// ---------------------------------------------------------------------------
function borde(color = C.linea, style = "thin") {
  return { top:{style,color:{argb:color}}, left:{style,color:{argb:color}},
           bottom:{style,color:{argb:color}}, right:{style,color:{argb:color}} };
}

function tituloSeccion(ws, fila, texto, ancho = 6, desdeCol = 1) {
  ws.mergeCells(fila, desdeCol, fila, desdeCol + ancho - 1);
  const c = ws.getCell(fila, desdeCol);
  c.value = texto;
  c.font = { name:"Calibri", size:12, bold:true, color:{argb:C.blanco} };
  c.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.verde700} };
  c.alignment = { vertical:"middle", indent:1 };
  ws.getRow(fila).height = 22;
  return fila + 1;
}

function encabezadoTabla(ws, fila, cols, desdeCol = 1) {
  cols.forEach((t, i) => {
    const c = ws.getCell(fila, i + desdeCol);
    c.value = t;
    c.font = { name:"Calibri", size:10, bold:true, color:{argb:C.blanco} };
    c.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.verde800} };
    c.alignment = { vertical:"middle", horizontal: i===0 ? "left" : "center", indent: i===0 ? 1 : 0 };
    c.border = borde(C.verde800);
  });
  ws.getRow(fila).height = 18;
  return fila + 1;
}

/** Tabla de ranking con % y barra de datos. Devuelve la fila siguiente. */
function tablaRanking(ws, fila, titulo, entradas, denom, etiquetaDenom, limite = 12) {
  fila = tituloSeccion(ws, fila, titulo, 4, 1);
  fila = encabezadoTabla(ws, fila, ["Categoría", "Cantidad", "% " + etiquetaDenom, "Peso relativo"]);
  const desde = fila;
  const lista = entradas.slice(0, limite);
  lista.forEach((e, i) => {
    const par = i % 2 === 0;
    const celdas = [e[0], e[1], denom ? e[1]/denom : 0, e[1]];
    celdas.forEach((v, j) => {
      const c = ws.getCell(fila, j+1);
      c.value = v;
      c.border = borde();
      c.fill = { type:"pattern", pattern:"solid", fgColor:{argb: par ? C.blanco : C.papel} };
      c.font = { name:"Calibri", size:10, color:{argb:C.tinta}, bold: i===0 };
      if (j === 0) c.alignment = { indent:1 };
      if (j === 1) { c.numFmt = "#,##0"; c.alignment = { horizontal:"center" }; }
      if (j === 2) { c.numFmt = "0.0%"; c.alignment = { horizontal:"center" }; }
      if (j === 3) c.font = { name:"Calibri", size:10, color:{argb: par ? C.blanco : C.papel} };
    });
    fila++;
  });
  if (lista.length) {
    // La "barra" es formato condicional nativo: se recalcula sola si cambian los datos.
    ws.addConditionalFormatting({
      ref: `D${desde}:D${fila-1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde600}, gradient:false }],
    });
  }
  if (entradas.length > limite) {
    const c = ws.getCell(fila, 1);
    c.value = `Se muestran las ${limite} principales de ${entradas.length}. El detalle completo está en la hoja "Datos".`;
    c.font = { name:"Calibri", size:9, italic:true, color:{argb:C.gris} };
    ws.mergeCells(fila, 1, fila, 4);
    fila++;
  }
  return fila + 1;
}

function hojaResumen(wb, a, secciones, conclusion) {
  const ws = wb.addWorksheet("Resumen ejecutivo", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins:{left:0.5,right:0.5,top:0.6,bottom:0.6,header:0.3,footer:0.3} },
  });
  ws.columns = [{width:3},{width:26},{width:18},{width:18},{width:18},{width:18},{width:14}];

  // Portada
  ws.mergeCells("B2:G4");
  const t = ws.getCell("B2");
  t.value = "Registro de Turistas";
  t.font = { name:"Calibri", size:30, bold:true, color:{argb:C.blanco} };
  t.alignment = { vertical:"middle", indent:1 };
  for (let col = 2; col <= 7; col++) {
    for (let f = 2; f <= 6; f++) {
      ws.getCell(f, col).fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.tinta} };
    }
  }
  ws.mergeCells("B5:G5");
  const st = ws.getCell("B5");
  st.value = "I. Municipalidad de Cobquecura — La Costa de Ñuble";
  st.font = { name:"Calibri", size:12, color:{argb:C.verde} };
  st.alignment = { indent:1 };
  ws.mergeCells("B6:G6");
  const pe = ws.getCell("B6");
  pe.value = a.desde ? `Informe del período ${fechaLarga(a.desde)} al ${fechaLarga(a.hasta)}` : "Informe de temporada";
  pe.font = { name:"Calibri", size:10, color:{argb:C.papel2} };
  pe.alignment = { indent:1 };
  ws.getRow(2).height = 30; ws.getRow(3).height = 22; ws.getRow(4).height = 12;
  ws.getRow(5).height = 20; ws.getRow(6).height = 20;

  // Cifras principales
  let fila = 8;
  const kpis = [
    ["Turistas atendidos", a.turistas, "#,##0"],
    ["Atenciones registradas", a.n, "#,##0"],
    ["Grupo promedio", a.grupoMedio, "0.0"],
    ["Días con actividad", a.diasConRegistro, "#,##0"],
  ];
  kpis.forEach((k, i) => {
    const col = 2 + i * (i < 4 ? 1 : 1);
    const cTit = ws.getCell(fila, 2 + i);
    cTit.value = k[0];
    cTit.font = { name:"Calibri", size:9, bold:true, color:{argb:C.verde700} };
    cTit.alignment = { horizontal:"center" };
    cTit.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
    cTit.border = { top:{style:"medium",color:{argb:C.verde}}, left:borde().left, right:borde().right };
    const cVal = ws.getCell(fila+1, 2 + i);
    cVal.value = k[1];
    cVal.numFmt = k[2];
    cVal.font = { name:"Calibri", size:20, bold:true, color:{argb:C.tinta} };
    cVal.alignment = { horizontal:"center" };
    cVal.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
    cVal.border = { bottom:borde().bottom, left:borde().left, right:borde().right };
  });
  ws.getRow(fila).height = 16;
  ws.getRow(fila+1).height = 30;
  fila += 3;

  // Análisis narrativo
  secciones.forEach(sec => {
    ws.mergeCells(fila, 2, fila, 7);
    const h = ws.getCell(fila, 2);
    h.value = sec.titulo;
    h.font = { name:"Calibri", size:12, bold:true, color:{argb:C.verde800} };
    h.border = { bottom:{style:"medium", color:{argb:C.verde}} };
    ws.getRow(fila).height = 20;
    fila++;

    ws.mergeCells(fila, 2, fila, 7);
    const p = ws.getCell(fila, 2);
    p.value = sec.texto;
    p.font = { name:"Calibri", size:10, color:{argb:C.tinta} };
    p.alignment = { wrapText:true, vertical:"top" };
    // Alto estimado: el ancho útil son ~100 caracteres por línea.
    const lineas = sec.texto.split("\n").reduce((acc,l)=>acc + Math.max(1, Math.ceil(l.length/100)), 0);
    ws.getRow(fila).height = Math.max(30, lineas * 13);
    fila += 2;
  });

  // Conclusión
  ws.mergeCells(fila, 2, fila, 7);
  const ct = ws.getCell(fila, 2);
  ct.value = "En resumen";
  ct.font = { name:"Calibri", size:13, bold:true, color:{argb:C.blanco} };
  ct.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.verde700} };
  ct.alignment = { vertical:"middle", indent:1 };
  ws.getRow(fila).height = 24;
  fila++;
  ws.mergeCells(fila, 2, fila, 7);
  const cc = ws.getCell(fila, 2);
  cc.value = conclusion;
  cc.font = { name:"Calibri", size:11, color:{argb:C.tinta} };
  cc.alignment = { wrapText:true, vertical:"top", indent:1 };
  cc.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
  cc.border = borde(C.verde);
  ws.getRow(fila).height = Math.max(60, Math.ceil(conclusion.length/95) * 15);
  fila += 2;

  const pie = ws.getCell(fila, 2);
  pie.value = "Informe generado automáticamente por la aplicación Registro de Turistas.";
  pie.font = { name:"Calibri", size:9, italic:true, color:{argb:C.gris} };
  return ws;
}

function hojaDashboard(wb, a, nFilas) {
  // Sin fitToWidth el tablero se parte al imprimir y la última cifra
  // ("Grupo medio") termina sola en otra hoja.
  const ws = wb.addWorksheet("Dashboard", {
    views:[{ showGridLines:false }],
    pageSetup:{ paperSize:9, orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:0,
                margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3} },
  });
  ws.columns = [{width:3},{width:28},{width:16},{width:16},{width:16},{width:16},{width:16}];
  const F = nFilas + 1;   // última fila con datos en la hoja Datos

  ws.mergeCells("B2:G2");
  const t = ws.getCell("B2");
  t.value = "Tablero de control";
  t.font = { name:"Calibri", size:18, bold:true, color:{argb:C.blanco} };
  t.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.tinta} };
  t.alignment = { vertical:"middle", indent:1 };
  ws.getRow(2).height = 32;

  const ayuda = ws.getCell("B3");
  ayuda.value = "Elige un mes en la casilla verde: todas las cifras de esta hoja se recalculan solas.";
  ayuda.font = { name:"Calibri", size:9, italic:true, color:{argb:C.gris} };
  ws.mergeCells("B3:G3");

  // Selector de mes: validación de lista nativa de Excel.
  const meses = a.porMes.map(m => nombreMes(m[0]));
  const opciones = ["Toda la temporada", ...meses];
  ws.getCell("B5").value = "Período";
  ws.getCell("B5").font = { name:"Calibri", size:10, bold:true, color:{argb:C.verde700} };
  const sel = ws.getCell("C5");
  sel.value = "Toda la temporada";
  sel.dataValidation = {
    type: "list", allowBlank: false,
    formulae: [`"${opciones.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Período no válido",
    error: "Elige uno de los períodos de la lista.",
  };
  sel.font = { name:"Calibri", size:11, bold:true, color:{argb:C.tinta} };
  sel.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.verde} };
  sel.border = borde(C.verde700, "medium");
  sel.alignment = { horizontal:"center" };
  // Formato Texto: sin esto Excel puede convertir "Diciembre 2026" en la fecha
  // 01/12/2026 al elegirla, y entonces ninguna comparación calza.
  sel.numFmt = "@";
  ws.mergeCells("C5:D5");

  // Criterio normalizado (columna oculta). Traduce lo que haya en el selector a
  // un AAAAMM comparable: 0 = toda la temporada, -1 = no existe.
  // Acepta tanto el texto de la lista como una fecha escrita a mano, que es lo
  // que la gente hace cuando el desplegable no salta.
  const cri = ws.getCell("I5");
  cri.value = { formula:
    `IF($C$5="Toda la temporada",0,` +
    `IF(ISNUMBER($C$5),YEAR($C$5)*100+MONTH($C$5),` +
    `IFERROR(INDEX(Datos!$S$2:$S$${F},MATCH($C$5,Datos!$B$2:$B$${F},0)),-1)))` };
  ws.getColumn(9).hidden = true;

  // Un tablero que muestra 0 sin explicar por qué es peor que uno que avisa.
  const aviso = ws.getCell("B6");
  // Dos formas de quedarse sin datos, y las dos tienen que hablar:
  //  -1  = lo escrito no corresponde a ningún período conocido.
  //  mes válido pero sin registros = pasa cuando alguien escribe una fecha y
  //  Excel la interpreta con otro orden de día/mes. Antes salían ceros mudos.
  aviso.value = { formula:
    `IF($I$5=-1,"Ese período no existe. Elige uno de la lista desplegable de la casilla verde.",` +
    `IF(AND($I$5<>0,COUNTIF(Datos!$S$2:$S$${F},$I$5)=0),` +
    `"Se entendió el mes "&LEFT(TEXT($I$5,"000000"),4)&"-"&RIGHT(TEXT($I$5,"000000"),2)&", que no tiene registros. Elige un período de la lista desplegable.",` +
    `""))` };
  aviso.font = { name:"Calibri", size:9, bold:true, color:{argb:C.alerta} };
  aviso.alignment = { vertical:"middle" };
  ws.mergeCells("B6:G6");
  ws.getRow(6).height = 14;

  // KPIs que dependen del selector.
  const kpi = (col, titulo, formula, fmt) => {
    const cT = ws.getCell(7, col);
    cT.value = titulo;
    cT.font = { name:"Calibri", size:9, bold:true, color:{argb:C.verde700} };
    cT.alignment = { horizontal:"center" };
    cT.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
    cT.border = { top:{style:"medium",color:{argb:C.verde}}, left:borde().left, right:borde().right };
    const cV = ws.getCell(8, col);
    cV.value = { formula };
    cV.numFmt = fmt;
    cV.font = { name:"Calibri", size:18, bold:true, color:{argb:C.tinta} };
    cV.alignment = { horizontal:"center" };
    cV.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
    cV.border = { bottom:borde().bottom, left:borde().left, right:borde().right };
  };
  const todo = `$I$5=0`;
  const S = `Datos!$S$2:$S$${F}`;
  kpi(2, "Turistas", `IF(${todo},SUM(Datos!$J$2:$J$${F}),SUMIF(${S},$I$5,Datos!$J$2:$J$${F}))`, "#,##0");
  kpi(3, "Atenciones", `IF(${todo},COUNTA(Datos!$A$2:$A$${F}),COUNTIF(${S},$I$5))`, "#,##0");
  kpi(4, "Femenino", `IFERROR(IF(${todo},SUM(Datos!$H$2:$H$${F}),SUMIF(${S},$I$5,Datos!$H$2:$H$${F}))/$B$8,0)`, "0.0%");
  kpi(5, "Masculino", `IFERROR(IF(${todo},SUM(Datos!$I$2:$I$${F}),SUMIF(${S},$I$5,Datos!$I$2:$I$${F}))/$B$8,0)`, "0.0%");
  kpi(6, "Grupo medio", `IFERROR($B$8/$C$8,0)`, "0.0");
  ws.getRow(7).height = 16;
  ws.getRow(8).height = 28;

  // Tablas vivas: también responden al selector.
  let fila = 10;
  const tablaViva = (titulo, etiquetas, colDatos) => {
    // Desde la columna B: la A mide 3 de ancho y las etiquetas salían cortadas.
    fila = tituloSeccion(ws, fila, titulo, 4, 2);
    fila = encabezadoTabla(ws, fila, ["Categoría", "Turistas", "% del período", "Peso relativo"], 2);
    const desde = fila;
    etiquetas.forEach((et, i) => {
      const par = i % 2 === 0;
      const f = fila;
      const cN = ws.getCell(f, 2); cN.value = et;
      const cV = ws.getCell(f, 3);
      cV.value = { formula: `IF(${todo},SUMIF(Datos!$${colDatos}$2:$${colDatos}$${F},$B${f},Datos!$J$2:$J$${F}),SUMIFS(Datos!$J$2:$J$${F},Datos!$${colDatos}$2:$${colDatos}$${F},$B${f},Datos!$S$2:$S$${F},$I$5))` };
      cV.numFmt = "#,##0";
      const cP = ws.getCell(f, 4);
      cP.value = { formula: `IFERROR($C${f}/$B$8,0)` };
      cP.numFmt = "0.0%";
      const cB = ws.getCell(f, 5);
      cB.value = { formula: `$C${f}` };
      [cN,cV,cP,cB].forEach((c, j) => {
        c.border = borde();
        c.fill = { type:"pattern", pattern:"solid", fgColor:{argb: par ? C.blanco : C.papel} };
        c.font = { name:"Calibri", size:10, color:{argb: j===3 ? (par?C.blanco:C.papel) : C.tinta} };
        if (j === 0) c.alignment = { indent:1 };
        if (j > 0 && j < 3) c.alignment = { horizontal:"center" };
      });
      fila++;
    });
    ws.addConditionalFormatting({
      ref: `E${desde}:E${fila-1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde600}, gradient:false }],
    });
    fila += 1;
  };

  tablaViva("Afluencia por día de la semana", DIAS, "C");
  tablaViva("Origen del visitante", a.porRegion.slice(0, 10).map(r=>r[0]), "E");
  tablaViva("Motivo del viaje", a.porMotivo.slice(0, 8).map(r=>r[0]), "P");
  return ws;
}

function hojaAnalisis(wb, a) {
  const ws = wb.addWorksheet("Análisis", {
    views:[{ showGridLines:false }],
    pageSetup:{ paperSize:9, orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:0,
                margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3} },
  });
  ws.columns = [{width:34},{width:14},{width:14},{width:16},{width:14}];
  let fila = 1;
  ws.mergeCells("A1:D1");
  const t = ws.getCell("A1");
  t.value = "Análisis por dimensión";
  t.font = { name:"Calibri", size:16, bold:true, color:{argb:C.blanco} };
  t.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.tinta} };
  t.alignment = { vertical:"middle", indent:1 };
  ws.getRow(1).height = 28;
  fila = 3;
  fila = tablaRanking(ws, fila, "Turistas por mes", a.porMesTop.map(m=>[nombreMes(m[0]), m[1]]), a.turistas, "de los turistas");
  fila = tablaRanking(ws, fila, "Turistas por día de la semana", a.porDiaSemanaTop, a.turistas, "de los turistas", 7);
  fila = tablaRanking(ws, fila, "Fechas de mayor afluencia", a.porFecha.slice(0,10).map(f=>[fechaLarga(f[0]), f[1]]), a.turistas, "de los turistas", 10);
  fila = tablaRanking(ws, fila, "Composición por edad", a.edadesTop, a.turistas, "de los turistas", 5);
  fila = tablaRanking(ws, fila, "Origen del visitante", a.porRegion, a.n, "de los registros");
  fila = tablaRanking(ws, fila, "Comunas y países de procedencia", a.porProcedencia, a.n, "de los registros", 15);
  fila = tablaRanking(ws, fila, "Motivo del viaje", a.porMotivo, a.n, "de los registros", 10);
  fila = tablaRanking(ws, fila, "Atractivos más consultados", a.atractivos, a.n, "de los registros", 15);
  fila = tablaRanking(ws, fila, "Servicios más requeridos", a.servicios, a.n, "de los registros", 15);
  if (a.informadores.length) fila = tablaRanking(ws, fila, "Registros por informador", a.informadores, a.n, "de los registros", 10);
  return ws;
}

function hojaDatos(wb, records) {
  const ws = wb.addWorksheet("Datos", { views:[{ state:"frozen", ySplit:1 }] });
  const cols = [
    ["Fecha", 12], ["Mes", 10], ["Día", 12], ["País", 16], ["Región", 22], ["Procedencia", 20],
    ["Informador", 18], ["Femenino", 10], ["Masculino", 10], ["Total", 8],
    ["Menor de 18", 12], ["18 a 29", 10], ["30 a 40", 10], ["41 a 50", 10], ["Mayor de 50", 12],
    ["Motivo", 26], ["Atractivos", 40], ["Servicios", 40],
    // Columna S: el mes como número AAAAMM. Existe para que el selector del
    // tablero pueda comparar sin depender del texto ni del idioma de Excel.
    ["MesNum", 10],
  ];
  ws.columns = cols.map(c => ({ width: c[1] }));
  cols.forEach((c, i) => {
    const cell = ws.getCell(1, i+1);
    cell.value = c[0];
    cell.font = { name:"Calibri", size:10, bold:true, color:{argb:C.blanco} };
    cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.verde800} };
    cell.alignment = { vertical:"middle", horizontal:"center" };
    cell.border = borde(C.verde800);
  });
  ws.getRow(1).height = 20;

  records.forEach((r, i) => {
    const f = i + 2;
    const fila = [
      r.fecha, nombreMes(String(r.fecha||"").slice(0,7)), diaSemana(r.fecha),
      r.pais||"", r.region||"", r.procedencia||"", r.informador||"",
      r.femenino||0, r.masculino||0, r.total||0,
      r.edad_menor18||0, r.edad_18_29||0, r.edad_30_40||0, r.edad_41_50||0, r.edad_mayor50||0,
      r.motivo||"", (r.atractivos||[]).join(" · "), (r.servicios||[]).join(" · "),
      mesNumero(r.fecha),
    ];
    fila.forEach((v, j) => {
      const c = ws.getCell(f, j+1);
      c.value = v;
      c.font = { name:"Calibri", size:10, color:{argb:C.tinta} };
      c.border = borde();
      if (i % 2) c.fill = { type:"pattern", pattern:"solid", fgColor:{argb:C.papel} };
      if (j >= 7 && j <= 14) { c.numFmt = "#,##0"; c.alignment = { horizontal:"center" }; }
    });
  });
  ws.autoFilter = { from:{row:1,column:1}, to:{row:records.length+1, column:cols.length} };
  // El total destaca sobre el resto: es la columna que más se mira.
  if (records.length) {
    ws.addConditionalFormatting({
      ref: `J2:J${records.length+1}`,
      rules: [{ type:"dataBar", cfvo:[{type:"min"},{type:"max"}], color:{argb:C.verde}, gradient:false }],
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

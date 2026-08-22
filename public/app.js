(function(){
  // Storage adapter: uses Claude's native window.storage when running inside
  // a Claude.ai artifact (shared, persistent, multi-user). When this app is
  // deployed standalone (e.g. via Claude Code, a static host, etc.) and
  // window.storage does not exist, it falls back to browser localStorage.
  //
  // IMPORTANT: localStorage is per-browser/per-device only -- it does NOT
  // sync between different informadores' phones or computers. If you need
  // a real shared, multi-user database outside Claude.ai, replace this
  // adapter with calls to a real backend (see README.md "Next steps").
  const hasNativeStorage = typeof window !== 'undefined' && window.storage &&
    typeof window.storage.get === 'function';
  window.__hasNativeStorage = hasNativeStorage;

  window.__storageAdapter = hasNativeStorage ? window.storage : (function(){
    const PREFIX = 'bt_';
    console.warn('[Registro de Turistas] window.storage no disponible: usando localStorage (solo en este dispositivo/navegador, no compartido).');
    return {
      async get(key){
        const raw = localStorage.getItem(PREFIX + key);
        if (raw === null) throw new Error('key not found: ' + key);
        return { key, value: raw, shared: false };
      },
      async set(key, value){
        localStorage.setItem(PREFIX + key, value);
        return { key, value, shared: false };
      },
      async delete(key){
        localStorage.removeItem(PREFIX + key);
        return { key, deleted: true, shared: false };
      },
      async list(prefix){
        const p = PREFIX + (prefix || '');
        const keys = Object.keys(localStorage)
          .filter(k => k.startsWith(p))
          .map(k => k.slice(PREFIX.length));
        return { keys, prefix, shared: false };
      }
    };
  })();
})();

(function(){
  const hasNativeStorage = !!window.__hasNativeStorage;
  const DEFAULT_ATRACTIVOS = ["Lobería","Iglesia de Piedra","Buchupureo","Pullay","Trehualemu","Rinconada","Santa Rita","Humedal Taucú","Humedal Colmuyao","Monte Zorro","Mela","Parque las Nalkas","Ecomuseo","Minimuseo","Cerro el Calvario","Centro Artesanal","Parque los Avellanos","Fiesta de la Candelaria"];
  const DEFAULT_SERVICIOS = ["Restaurantes","Guías turísticos","Tours Operadores","Oficinas de información turística"];
  const ALOJAMIENTO_TIPOS = ["Cabañas","Hostales","Campings","Hotel","Lodge","Residencial"];
  const TRANSPORTE_TIPOS = ["Buses","Taxis"];
  const MOTIVOS = ["Ocio / vacaciones","Surf","Negocios","Salud / bienestar","Estudios","Visita a familiares o amigos","Evento / convención","Otro"];
  const STORAGE_KEY = "bitacora-turistica-data";

  // Listado de países del mundo (193 miembros ONU + observadores + Taiwán/Palestina, uso frecuente en formularios)
  const PAISES = ["Afganistán","Albania","Alemania","Andorra","Angola","Antigua y Barbuda","Arabia Saudita","Argelia","Argentina","Armenia","Australia","Austria","Azerbaiyán","Bahamas","Baréin","Bangladés","Barbados","Bielorrusia","Bélgica","Belice","Benín","Bután","Bolivia","Bosnia y Herzegovina","Botsuana","Brasil","Brunéi","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Camboya","Camerún","Canadá","Catar","Chad","República Checa","Chile","China","Chipre","Colombia","Comoras","Congo","República Democrática del Congo","Corea del Norte","Corea del Sur","Costa Rica","Costa de Marfil","Croacia","Cuba","Dinamarca","Yibuti","Dominica","Ecuador","Egipto","El Salvador","Emiratos Árabes Unidos","Eritrea","Eslovaquia","Eslovenia","España","Estados Unidos","Estonia","Etiopía","Fiyi","Filipinas","Finlandia","Francia","Gabón","Gambia","Georgia","Ghana","Granada","Grecia","Guatemala","Guinea","Guinea-Bisáu","Guinea Ecuatorial","Guyana","Haití","Honduras","Hungría","India","Indonesia","Irán","Irak","Irlanda","Islandia","Islas Marshall","Islas Salomón","Israel","Italia","Jamaica","Japón","Jordania","Kazajistán","Kenia","Kirguistán","Kiribati","Kuwait","Laos","Lesoto","Letonia","Líbano","Liberia","Libia","Liechtenstein","Lituania","Luxemburgo","Macedonia del Norte","Madagascar","Malasia","Malaui","Maldivas","Malí","Malta","Marruecos","Mauricio","Mauritania","México","Micronesia","Moldavia","Mónaco","Mongolia","Montenegro","Mozambique","Birmania","Namibia","Nauru","Nepal","Nicaragua","Níger","Nigeria","Noruega","Nueva Zelanda","Omán","Países Bajos","Pakistán","Palaos","Palestina","Panamá","Papúa Nueva Guinea","Paraguay","Perú","Polonia","Portugal","Reino Unido","República Centroafricana","República Dominicana","Rumanía","Rusia","Ruanda","Samoa","San Cristóbal y Nieves","San Marino","San Vicente y las Granadinas","Santa Lucía","Santo Tomé y Príncipe","Senegal","Serbia","Seychelles","Sierra Leona","Singapur","Siria","Somalia","Sri Lanka","Suazilandia","Sudáfrica","Sudán","Sudán del Sur","Suecia","Suiza","Surinam","Tailandia","Taiwán","Tanzania","Tayikistán","Timor Oriental","Togo","Tonga","Trinidad y Tobago","Túnez","Turkmenistán","Turquía","Tuvalu","Ucrania","Uganda","Uruguay","Uzbekistán","Vanuatu","Ciudad del Vaticano","Venezuela","Vietnam","Yemen","Zambia","Zimbabue"];

  // Regiones de Chile -> provincias (mostradas como "Ciudad", usando su capital) -> comunas
  const CHILE_REGIONES = [
    { region: "Arica y Parinacota", provincias: [
      { ciudad: "Arica", comunas: ["Arica","Camarones"] },
      { ciudad: "Putre", comunas: ["Putre","General Lagos"] }
    ]},
    { region: "Tarapacá", provincias: [
      { ciudad: "Iquique", comunas: ["Iquique","Alto Hospicio"] },
      { ciudad: "Pozo Almonte", comunas: ["Pozo Almonte","Camiña","Colchane","Huara","Pica"] }
    ]},
    { region: "Antofagasta", provincias: [
      { ciudad: "Antofagasta", comunas: ["Antofagasta","Mejillones","Sierra Gorda","Taltal"] },
      { ciudad: "Calama", comunas: ["Calama","Ollagüe","San Pedro de Atacama"] },
      { ciudad: "Tocopilla", comunas: ["Tocopilla","María Elena"] }
    ]},
    { region: "Atacama", provincias: [
      { ciudad: "Copiapó", comunas: ["Copiapó","Caldera","Tierra Amarilla"] },
      { ciudad: "Chañaral", comunas: ["Chañaral","Diego de Almagro"] },
      { ciudad: "Vallenar", comunas: ["Vallenar","Alto del Carmen","Freirina","Huasco"] }
    ]},
    { region: "Coquimbo", provincias: [
      { ciudad: "La Serena", comunas: ["La Serena","Coquimbo","Andacollo","La Higuera","Paihuano","Vicuña"] },
      { ciudad: "Illapel", comunas: ["Illapel","Canela","Los Vilos","Salamanca"] },
      { ciudad: "Ovalle", comunas: ["Ovalle","Combarbalá","Monte Patria","Punitaqui","Río Hurtado"] }
    ]},
    { region: "Valparaíso", provincias: [
      { ciudad: "Valparaíso", comunas: ["Valparaíso","Casablanca","Concón","Juan Fernández","Puchuncaví","Quintero","Viña del Mar"] },
      { ciudad: "Isla de Pascua", comunas: ["Isla de Pascua"] },
      { ciudad: "Los Andes", comunas: ["Los Andes","Calle Larga","Rinconada","San Esteban"] },
      { ciudad: "La Ligua", comunas: ["La Ligua","Cabildo","Papudo","Petorca","Zapallar"] },
      { ciudad: "Quillota", comunas: ["Quillota","La Calera","Hijuelas","La Cruz","Nogales"] },
      { ciudad: "San Antonio", comunas: ["San Antonio","Algarrobo","Cartagena","El Quisco","El Tabo","Santo Domingo"] },
      { ciudad: "San Felipe", comunas: ["San Felipe","Catemu","Llay-Llay","Panquehue","Putaendo","Santa María"] },
      { ciudad: "Quilpué", comunas: ["Quilpué","Limache","Olmué","Villa Alemana"] }
    ]},
    { region: "Metropolitana de Santiago", provincias: [
      { ciudad: "Colina", comunas: ["Colina","Lampa","Til Til"] },
      { ciudad: "Puente Alto", comunas: ["Pirque","Puente Alto","San José de Maipo"] },
      { ciudad: "San Bernardo", comunas: ["Buin","Calera de Tango","Paine","San Bernardo"] },
      { ciudad: "Melipilla", comunas: ["Alhué","Curacaví","María Pinto","Melipilla","San Pedro"] },
      { ciudad: "Santiago", comunas: ["Cerrillos","Cerro Navia","Conchalí","El Bosque","Estación Central","Huechuraba","Independencia","La Cisterna","La Granja","La Florida","La Pintana","La Reina","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipú","Ñuñoa","Pedro Aguirre Cerda","Peñalolén","Providencia","Pudahuel","Quilicura","Quinta Normal","Recoleta","Renca","San Miguel","San Joaquín","San Ramón","Santiago","Vitacura"] },
      { ciudad: "Talagante", comunas: ["El Monte","Isla de Maipo","Padre Hurtado","Peñaflor","Talagante"] }
    ]},
    { region: "O'Higgins", provincias: [
      { ciudad: "Rancagua", comunas: ["Rancagua","Codegua","Coinco","Coltauco","Doñihue","Graneros","Las Cabras","Machalí","Malloa","Mostazal","Olivar","Peumo","Pichidegua","Quinta de Tilcoco","Rengo","Requínoa","San Vicente"] },
      { ciudad: "Pichilemu", comunas: ["Pichilemu","La Estrella","Litueche","Marchigüe","Navidad","Paredones"] },
      { ciudad: "San Fernando", comunas: ["San Fernando","Chépica","Chimbarongo","Lolol","Nancagua","Palmilla","Peralillo","Placilla"] }
    ]},
    { region: "Maule", provincias: [
      { ciudad: "Talca", comunas: ["Constitución","Curepto","Empedrado","Maule","Pelarco","Pencahue","Río Claro","San Clemente","San Rafael","Talca"] },
      { ciudad: "Cauquenes", comunas: ["Cauquenes","Chanco","Pelluhue"] },
      { ciudad: "Curicó", comunas: ["Curicó","Hualañé","Licantén","Molina","Rauco","Romeral","Sagrada Familia","Teno","Vichuquén"] },
      { ciudad: "Linares", comunas: ["Colbún","Linares","Longaví","Parral","Retiro","San Javier","Villa Alegre","Yerbas Buenas"] }
    ]},
    { region: "Ñuble", provincias: [
      { ciudad: "Quirihue", comunas: ["Cobquecura","Coelemu","Ninhue","Portezuelo","Quirihue","Ránquil","Trehuaco"] },
      { ciudad: "Chillán", comunas: ["Bulnes","Chillán Viejo","Chillán","El Carmen","Pemuco","Pinto","Quillón","San Ignacio","Yungay"] },
      { ciudad: "San Carlos", comunas: ["Coihueco","Ñiquén","San Carlos","San Fabián","San Nicolás"] }
    ]},
    { region: "Biobío", provincias: [
      { ciudad: "Concepción", comunas: ["Chiguayante","Concepción","Coronel","Florida","Hualpén","Hualqui","Lota","Penco","San Pedro de la Paz","Santa Juana","Talcahuano","Tomé"] },
      { ciudad: "Lebu", comunas: ["Arauco","Cañete","Contulmo","Curanilahue","Lebu","Los Álamos","Tirúa"] },
      { ciudad: "Los Ángeles", comunas: ["Alto Biobío","Antuco","Cabrero","Laja","Los Ángeles","Mulchén","Nacimiento","Negrete","Quilaco","Quilleco","San Rosendo","Santa Bárbara","Tucapel","Yumbel"] }
    ]},
    { region: "La Araucanía", provincias: [
      { ciudad: "Temuco", comunas: ["Carahue","Cholchol","Cunco","Curarrehue","Freire","Galvarino","Gorbea","Lautaro","Loncoche","Melipeuco","Nueva Imperial","Padre Las Casas","Perquenco","Pitrufquén","Pucón","Saavedra","Temuco","Teodoro Schmidt","Toltén","Vilcún","Villarrica"] },
      { ciudad: "Angol", comunas: ["Angol","Collipulli","Curacautín","Ercilla","Lonquimay","Los Sauces","Lumaco","Purén","Renaico","Traiguén","Victoria"] }
    ]},
    { region: "Los Ríos", provincias: [
      { ciudad: "Valdivia", comunas: ["Mariquina","Lanco","Máfil","Valdivia","Corral","Paillaco","Los Lagos","Panguipulli"] },
      { ciudad: "La Unión", comunas: ["La Unión","Río Bueno","Lago Ranco","Futrono"] }
    ]},
    { region: "Los Lagos", provincias: [
      { ciudad: "Osorno", comunas: ["Osorno","Puerto Octay","Purranque","Puyehue","Río Negro","San Juan de la Costa","San Pablo"] },
      { ciudad: "Puerto Montt", comunas: ["Calbuco","Cochamó","Fresia","Frutillar","Llanquihue","Los Muermos","Maullín","Puerto Montt","Puerto Varas"] },
      { ciudad: "Castro", comunas: ["Ancud","Castro","Chonchi","Curaco de Vélez","Dalcahue","Puqueldón","Queilén","Quemchi","Quellón","Quinchao"] },
      { ciudad: "Chaitén", comunas: ["Chaitén","Futaleufú","Hualaihué","Palena"] }
    ]},
    { region: "Aysén", provincias: [
      { ciudad: "Coyhaique", comunas: ["Coyhaique","Lago Verde"] },
      { ciudad: "Puerto Aysén", comunas: ["Aysén","Cisnes","Guaitecas"] },
      { ciudad: "Cochrane", comunas: ["Cochrane","O'Higgins","Tortel"] },
      { ciudad: "Chile Chico", comunas: ["Chile Chico","Río Ibáñez"] }
    ]},
    { region: "Magallanes y de la Antártica Chilena", provincias: [
      { ciudad: "Punta Arenas", comunas: ["Laguna Blanca","Punta Arenas","Río Verde","San Gregorio"] },
      { ciudad: "Puerto Natales", comunas: ["Natales","Torres del Paine"] },
      { ciudad: "Porvenir", comunas: ["Porvenir","Primavera","Timaukel"] },
      { ciudad: "Puerto Williams", comunas: ["Cabo de Hornos","Antártica"] }
    ]}
  ];

  let state = {
    records: [],
    atractivosCustom: [],
    serviciosCustom: []
  };
  let selectedAtractivos = new Set();
  let selectedServicios = new Set();

  const $ = (id) => document.getElementById(id);

  function todayStr(){
    const d = new Date();
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  $("f-fecha").value = todayStr();

  // "YYYY-MM-DD" parsed as a LOCAL date (avoids the off-by-one day shift that
  // `new Date("YYYY-MM-DD")` causes when the browser timezone is behind UTC).
  function parseLocalDate(str){
    const [y,m,d] = String(str).split("-").map(Number);
    return new Date(y, (m||1)-1, d||1);
  }

  // ---------- Login ----------
  const PERSONAL = ["Angélica Alarcón"]; // Lista de personal habilitado para iniciar sesión — agregar más nombres aquí

  const loginScreen = $("login-screen");
  const appWrap = $("app-wrap");
  const loginUserSelect = $("login-user");

  function populateLoginUsers(){
    loginUserSelect.innerHTML = PERSONAL.map(p=>`<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join("");
  }

  function enterApp(userName){
    state.currentUser = userName;
    loginScreen.classList.add("hidden");
    appWrap.classList.remove("hidden");
    $("f-informador").value = userName;
  }

  populateLoginUsers();

  function mostrarErrorLogin(msg){
    const el = $("login-error");
    if(!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  // Se llama cuando el servidor responde 401 en medio del uso: la sesión venció
  // y hay que volver a pedir la clave, en vez de seguir como si nada.
  function volverAlLogin(msg){
    appWrap.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    $("login-clave-field").classList.remove("hidden");
    const campo = $("login-clave");
    if(campo) campo.value = "";
    mostrarErrorLogin(msg || "");
  }

  // Decide si hay que pedir la clave. Solo se pide cuando hay backend
  // compartido y todavía no hay sesión en este dispositivo. Devuelve true si el
  // informador ya quedó dentro sin escribir nada.
  async function iniciarPantallaLogin(){
    const est = await consultarSesion();
    apiDisponible = !!est.api;
    sesionIniciada = !!est.autenticado;
    $("login-clave-field").classList.toggle("hidden", !(apiDisponible && !sesionIniciada));
    const savedUser = sessionStorage.getItem("bt_current_user");
    if(savedUser && PERSONAL.includes(savedUser) && (!apiDisponible || sesionIniciada)){
      enterApp(savedUser);
      return true;
    }
    return false;
  }

  async function intentarIngresar(){
    const chosen = loginUserSelect.value;
    if(!chosen) return;
    const btn = $("login-btn");

    if(apiDisponible && !sesionIniciada){
      const campo = $("login-clave");
      const clave = campo ? campo.value : "";
      if(!clave){ mostrarErrorLogin("Escribe la clave de acceso."); return; }
      btn.disabled = true;
      mostrarErrorLogin("");
      try{
        const res = await fetch('/api/login', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ clave })
        });
        if(res.status === 429){
          mostrarErrorLogin("Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.");
          return;
        }
        if(!res.ok){ mostrarErrorLogin("Clave incorrecta."); return; }
        sesionIniciada = true;
        campo.value = "";
        $("login-clave-field").classList.add("hidden");
      }catch(e){
        mostrarErrorLogin("No se pudo conectar con el servidor. Revisa tu señal.");
        return;
      }finally{
        btn.disabled = false;
      }
      await loadState();   // recién ahora hay permiso para traer los registros
    }

    sessionStorage.setItem("bt_current_user", chosen);
    enterApp(chosen);
  }

  $("login-btn").addEventListener("click", intentarIngresar);
  $("login-clave").addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){ e.preventDefault(); intentarIngresar(); }
  });

  // ---------- Backend compartido (API) vs. almacenamiento local ----------
  // Cuando la app corre con server.js (Railway) hay un backend real con Postgres
  // y TODOS los dispositivos comparten los mismos registros. Si la API no
  // responde (ej. GitHub Pages, sin servidor, o sin conexión) se cae de vuelta
  // al comportamiento anterior: guardar solo en este dispositivo/navegador.
  let useApi = false;
  let apiDisponible = false;   // hay backend compartido respondiendo
  let sesionIniciada = false;  // además, esta sesión está autenticada

  async function consultarSesion(){
    try{
      const res = await fetch('/api/sesion');
      if(!res.ok) return { api:false, autenticado:false };
      return await res.json();
    }catch(e){
      return { api:false, autenticado:false };
    }
  }

  async function fetchSharedData(){
    const [recRes, customRes] = await Promise.all([fetch('/api/records'), fetch('/api/custom')]);
    if(recRes.status === 401 || customRes.status === 401){
      // Sesión vencida o inexistente: NO es lo mismo que "no hay servidor".
      // Si se confundieran, la app caería a localStorage sin avisar y los
      // registros quedarían guardados solo en este teléfono.
      const err = new Error('no autorizado');
      err.noAutorizado = true;
      throw err;
    }
    if(!recRes.ok || !customRes.ok) throw new Error('api no disponible');
    const recData = await recRes.json();
    const customData = await customRes.json();
    return {
      records: recData.records || [],
      atractivosCustom: customData.atractivosCustom || [],
      serviciosCustom: customData.serviciosCustom || []
    };
  }

  async function loadLocalBlob(){
    try{
      const res = await window.__storageAdapter.get(STORAGE_KEY, true);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        state.records = parsed.records || [];
        state.atractivosCustom = parsed.atractivosCustom || [];
        state.serviciosCustom = parsed.serviciosCustom || [];
      }
    }catch(e){
      // no existing data yet, keep defaults
    }
  }

  function updateSharedNote(){
    // Restaurar lo borrado solo existe con base compartida: en modo local no hay
    // dónde guardar el registro oculto.
    const btnEliminados = $("ver-eliminados-btn");
    if(btnEliminados) btnEliminados.classList.toggle("hidden", !useApi);

    const note = document.querySelector(".shared-note");
    if(!note) return;
    note.textContent = useApi
      ? "Esta bitácora es compartida: todos los informadores que usen este enlace ven y añaden a los mismos registros."
      : "Sin conexión al servidor compartido: los registros se están guardando solo en este dispositivo/navegador.";
    note.classList.toggle("mismatch", !useApi);
  }

  async function loadState(){
    if(hasNativeStorage){
      useApi = false;
      await loadLocalBlob();
    } else {
      try{
        const shared = await fetchSharedData();
        useApi = true;
        state.records = shared.records;
        state.atractivosCustom = shared.atractivosCustom;
        state.serviciosCustom = shared.serviciosCustom;
      }catch(e){
        if(e && e.noAutorizado){
          // Hay servidor, pero la sesión caducó: se vuelve a pedir la clave en
          // vez de guardar a ciegas en este dispositivo.
          sesionIniciada = false;
          volverAlLogin("Tu sesión venció. Vuelve a escribir la clave.");
          return;
        }
        useApi = false;
        console.warn('[Registro de Turistas] Backend compartido no disponible: usando localStorage local a este dispositivo.', e);
        await loadLocalBlob();
      }
    }
    updateSharedNote();
    renderChips();
    renderPanel();
    renderHistorial();
  }

  async function refreshFromApi(){
    if(!useApi) return;
    try{
      const shared = await fetchSharedData();
      state.records = shared.records;
      state.atractivosCustom = shared.atractivosCustom;
      state.serviciosCustom = shared.serviciosCustom;
    }catch(e){
      console.error('[Registro de Turistas] No se pudo actualizar desde el servidor.', e);
    }
  }

  async function saveState(){
    try{
      await window.__storageAdapter.set(STORAGE_KEY, JSON.stringify(state), true);
    }catch(e){
      console.error("No se pudo guardar", e);
    }
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      $("panel-"+btn.dataset.tab).classList.add("active");
      if(btn.dataset.tab === "panel"){ await refreshFromApi(); renderPanel(); }
      if(btn.dataset.tab === "historial"){ await refreshFromApi(); renderHistorial(); }
      if(btn.dataset.tab === "informe"){ await renderInforme(); }
    });
  });

  // ---------- Botones del Informe ----------
  // Al pasar a modo impresión el ancho de la hoja es menor que el de la
  // pantalla. Chart.js no siempre alcanza a reajustar el canvas solo, y el
  // gráfico saldría cortado en el PDF: se le pide el resize a mano.
  window.addEventListener("beforeprint", ()=>{
    Object.keys(chartInstances).forEach(id=>{
      try{ chartInstances[id] && chartInstances[id].resize(); }catch(e){}
    });
  });

  const infPdf = $("informe-pdf-btn");
  if(infPdf) infPdf.addEventListener("click", ()=>{
    // El PDF lo genera el propio navegador al imprimir. No hace falta ninguna
    // librería ni que el servidor cargue un Chrome headless.
    window.print();
  });
  const infRec = $("informe-recargar-btn");
  if(infRec) infRec.addEventListener("click", ()=> renderInforme(true));

  // ---------- Chips (servicios) + dropdowns (atractivos, alojamiento, transporte) ----------
  function setupDropdownMultiselect({toggleId, panelId, containerId, getOptions, selectedSet, emptyLabel, singular, plural}){
    const toggle = $(toggleId), panel = $(panelId), container = $(containerId);
    function render(){
      const options = getOptions();
      panel.innerHTML = options.map(o=>`
        <label class="dropdown-option">
          <input type="checkbox" value="${escapeAttr(o)}" ${selectedSet.has(o)?'checked':''}>
          <span>${escapeHtml(o)}</span>
        </label>
      `).join("");
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
        cb.addEventListener("change", ()=>{
          const v = cb.value;
          cb.checked ? selectedSet.add(v) : selectedSet.delete(v);
          updateLabel();
        });
      });
      updateLabel();
    }
    function updateLabel(){
      const n = getOptions().filter(o=>selectedSet.has(o)).length;
      toggle.textContent = n===0 ? emptyLabel : (n + " " + (n===1 ? singular : plural) + " seleccionado" + (n===1?"":"s"));
    }
    toggle.addEventListener("click", (e)=>{
      e.stopPropagation();
      container.classList.toggle("open");
    });
    document.addEventListener("click", (e)=>{
      if(!container.contains(e.target)) container.classList.remove("open");
    });
    return { render };
  }

  const atractivosDD = setupDropdownMultiselect({
    toggleId:"atractivos-toggle", panelId:"atractivos-panel", containerId:"atractivos-dropdown",
    getOptions: ()=>[...DEFAULT_ATRACTIVOS, ...state.atractivosCustom],
    selectedSet: selectedAtractivos,
    emptyLabel: "Selecciona atractivos…", singular:"atractivo", plural:"atractivos"
  });
  const alojamientoDD = setupDropdownMultiselect({
    toggleId:"alojamiento-toggle", panelId:"alojamiento-panel", containerId:"alojamiento-dropdown",
    getOptions: ()=>ALOJAMIENTO_TIPOS,
    selectedSet: selectedServicios,
    emptyLabel: "Alojamiento…", singular:"tipo de alojamiento", plural:"tipos de alojamiento"
  });
  const transporteDD = setupDropdownMultiselect({
    toggleId:"transporte-toggle", panelId:"transporte-panel", containerId:"transporte-dropdown",
    getOptions: ()=>TRANSPORTE_TIPOS,
    selectedSet: selectedServicios,
    emptyLabel: "Transporte…", singular:"medio de transporte", plural:"medios de transporte"
  });

  function renderChips(){
    atractivosDD.render();
    alojamientoDD.render();
    transporteDD.render();
    renderServiciosChips();
  }

  function renderServiciosChips(){
    const servicios = [...DEFAULT_SERVICIOS, ...state.serviciosCustom];
    $("servicios-chips").innerHTML = servicios.map(s=>
      `<div class="chip ${selectedServicios.has(s)?'selected':''}" data-val="${escapeAttr(s)}" data-group="servicio">${escapeHtml(s)}</div>`
    ).join("");
    document.querySelectorAll('.chip[data-group="servicio"]').forEach(c=>{
      c.addEventListener("click", ()=>{
        const v = c.dataset.val;
        selectedServicios.has(v) ? selectedServicios.delete(v) : selectedServicios.add(v);
        renderServiciosChips();
      });
    });
  }

  async function addCustomOption(kind, val){
    if(useApi){
      try{
        const res = await fetch('/api/custom', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({kind, value: val})
        });
        const data = await res.json();
        state.atractivosCustom = data.atractivosCustom;
        state.serviciosCustom = data.serviciosCustom;
        return;
      }catch(e){
        console.error('No se pudo guardar la opción personalizada en el servidor', e);
      }
    }
    if(kind === "atractivo"){ if(!state.atractivosCustom.includes(val)) state.atractivosCustom.push(val); }
    else { if(!state.serviciosCustom.includes(val)) state.serviciosCustom.push(val); }
    if(!useApi) await saveState();
  }

  $("atractivo-add-btn").addEventListener("click", async ()=>{
    const parts = $("atractivo-new").value.split(",").map(s=>s.trim()).filter(Boolean);
    if(parts.length === 0) return;
    for(const val of parts){
      await addCustomOption("atractivo", val);
      selectedAtractivos.add(val);
    }
    $("atractivo-new").value = "";
    renderChips();
  });
  $("servicio-add-btn").addEventListener("click", async ()=>{
    const parts = $("servicio-new").value.split(",").map(s=>s.trim()).filter(Boolean);
    if(parts.length === 0) return;
    for(const val of parts){
      await addCustomOption("servicio", val);
      selectedServicios.add(val);
    }
    $("servicio-new").value = "";
    renderChips();
  });

  // ---------- País / subdivisión Chile ----------
  const paisSelect = $("f-pais");
  const regionSelect = $("f-region");
  const comunaSelect = $("f-comuna");
  const chileBlock = $("chile-subdivision-block");

  function populatePaisSelect(){
    const sorted = [...PAISES].sort((a,b)=>a.localeCompare(b,"es"));
    paisSelect.innerHTML = sorted.map(p=>`<option value="${escapeAttr(p)}">${p}</option>`).join("");
    paisSelect.value = "Chile";
  }

  function populateRegionSelect(){
    regionSelect.innerHTML = `<option value="">Selecciona región…</option>` +
      CHILE_REGIONES.map(r=>`<option value="${escapeAttr(r.region)}">${r.region}</option>`).join("");
  }
  function resetComunaSelect(){
    comunaSelect.innerHTML = `<option value="">Selecciona comuna…</option>`;
  }

  function onRegionChange(){
    const r = CHILE_REGIONES.find(r=>r.region === regionSelect.value);
    if(!r){ resetComunaSelect(); return; }
    const comunas = r.provincias.flatMap(p=>p.comunas).sort((a,b)=>a.localeCompare(b,"es"));
    comunaSelect.innerHTML = `<option value="">Selecciona comuna…</option>` +
      comunas.map(c=>`<option value="${escapeAttr(c)}">${c}</option>`).join("");
  }

  function resetPaisCascade(){
    paisSelect.value = "Chile";
    chileBlock.classList.remove("hidden");
    populateRegionSelect();
    resetComunaSelect();
  }

  paisSelect.addEventListener("change", ()=>{
    if(paisSelect.value === "Chile"){
      chileBlock.classList.remove("hidden");
      populateRegionSelect();
      resetComunaSelect();
    } else {
      chileBlock.classList.add("hidden");
    }
  });
  regionSelect.addEventListener("change", onRegionChange);

  populatePaisSelect();
  populateRegionSelect();
  resetComunaSelect();

  // ---------- Total del grupo ----------
  function populateTotalSelect(){
    let opts = `<option value="">Selecciona el total…</option>`;
    for(let i=1;i<=20;i++) opts += `<option value="${i}">${i}</option>`;
    $("f-total").innerHTML = opts;
  }
  populateTotalSelect();

  // ---------- Sexo y rango de edad (selects acotados al total) ----------
  const SUBDIV_IDS = ["f-fem","f-masc","f-e1","f-e2","f-e3","f-e4","f-e5"];
  function populateSubdivSelects(maxVal){
    SUBDIV_IDS.forEach(id=>{
      const sel = $(id);
      const current = sel.value || "0";
      let opts = "";
      for(let i=0;i<=maxVal;i++) opts += `<option value="${i}">${i}</option>`;
      sel.innerHTML = opts;
      sel.value = (parseInt(current,10) <= maxVal) ? current : "0";
    });
  }
  function refreshSubdivSelects(){
    const total = num("f-total");
    populateSubdivSelects(total > 0 ? total : 20);
  }

  // ---------- Live sums ----------
  function num(id){ return parseInt($(id).value,10) || 0; }
  function updateHints(){
    const total = num("f-total");

    const fem = num("f-fem"), masc = num("f-masc");
    const sexSum = fem + masc;
    const totalEl = $("total-hint");
    totalEl.textContent = total ? ("Suma género: " + sexSum + " de " + total) : "Selecciona el total del grupo arriba.";
    totalEl.classList.toggle("mismatch", total>0 && sexSum !== total);

    const e1=num("f-e1"), e2=num("f-e2"), e3=num("f-e3"), e4=num("f-e4"), e5=num("f-e5");
    const edadSum = e1+e2+e3+e4+e5;
    const edadEl = $("edad-hint");
    edadEl.textContent = "Suma de edades: " + edadSum + (total ? (" de " + total) : "");
    edadEl.classList.toggle("mismatch", total>0 && edadSum !== total);
    return {total,fem,masc,sexSum,e1,e2,e3,e4,e5,edadSum};
  }
  $("f-total").addEventListener("change", refreshSubdivSelects);
  ["f-total","f-fem","f-masc","f-e1","f-e2","f-e3","f-e4","f-e5"].forEach(id=>{
    $(id).addEventListener("input", updateHints);
    $(id).addEventListener("change", updateHints);
  });
  refreshSubdivSelects();
  updateHints();

  // ---------- Motivo del viaje: "Otro" con texto libre ----------
  const motivoSelect = $("f-motivo");
  const motivoOtroInput = $("f-motivo-otro");
  motivoSelect.addEventListener("change", ()=>{
    motivoOtroInput.classList.toggle("hidden", motivoSelect.value !== "Otro");
  });

  // ---------- Save record ----------
  $("save-btn").addEventListener("click", async ()=>{
    const vals = updateHints();
    const fecha = $("f-fecha").value || todayStr();

    if(!vals.total){
      $("f-total").focus();
      $("f-total").style.borderColor = "var(--stamp)";
      setTimeout(()=>{ $("f-total").style.borderColor = ""; }, 1200);
      return;
    }

    const paisVal = paisSelect.value;
    let regionVal = "", comunaVal = "";
    if(paisVal === "Chile"){
      regionVal = regionSelect.value;
      comunaVal = comunaSelect.value;
      if(!regionVal || !comunaVal){
        const target = !regionVal ? regionSelect : comunaSelect;
        target.focus();
        target.style.borderColor = "var(--stamp)";
        setTimeout(()=>{ target.style.borderColor = ""; }, 1200);
        return;
      }
    }
    const procedencia = paisVal === "Chile" ? comunaVal : paisVal;

    let motivoVal = motivoSelect.value;
    if(motivoVal === "Otro"){
      const otroTexto = motivoOtroInput.value.trim();
      if(otroTexto) motivoVal = otroTexto;
    }

    const record = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2,7),
      fecha,
      pais: paisVal,
      region: regionVal,
      comuna: comunaVal,
      procedencia,
      informador: $("f-informador").value.trim(),
      femenino: vals.fem,
      masculino: vals.masc,
      total: vals.total,
      edad_menor18: vals.e1,
      edad_18_29: vals.e2,
      edad_30_40: vals.e3,
      edad_41_50: vals.e4,
      edad_mayor50: vals.e5,
      motivo: motivoVal,
      atractivos: [...selectedAtractivos],
      servicios: [...selectedServicios]
    };
    if(useApi){
      try{
        const res = await fetch('/api/records', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(record)
        });
        if(res.status === 401){
          sesionIniciada = false;
          volverAlLogin("Tu sesión venció. Vuelve a escribir la clave y guarda de nuevo.");
          return;
        }
        if(!res.ok) throw new Error('respuesta no OK del servidor');
        const data = await res.json();
        state.records.unshift(data.record);
      }catch(e){
        console.error('No se pudo guardar el registro en el servidor', e);
        alert('No se pudo guardar el registro: sin conexión con el servidor compartido. Intenta de nuevo.');
        return;
      }
    } else {
      state.records.unshift(record);
      await saveState();
    }

    // reset form
    resetPaisCascade();
    $("f-informador").value = state.currentUser || "";
    $("f-total").value = "";
    refreshSubdivSelects();
    ["f-fem","f-masc","f-e1","f-e2","f-e3","f-e4","f-e5"].forEach(id=> $(id).value = 0);
    motivoSelect.value = "Ocio / vacaciones";
    motivoOtroInput.value = "";
    motivoOtroInput.classList.add("hidden");
    selectedAtractivos.clear();
    selectedServicios.clear();
    renderChips();
    updateHints();

    const btn = $("save-btn");
    btn.classList.add("stamped");
    setTimeout(()=>btn.classList.remove("stamped"), 350);
    const msg = $("stamp-msg");
    msg.classList.add("show");
    setTimeout(()=>msg.classList.remove("show"), 1800);

    renderPanel();
    renderHistorial();
  });

  // ---------- Panel / dashboard (Chart.js) ----------
  // Serie de los gráficos, tomada del paisaje de la comuna: campo, mar, bosque,
  // trigo. Todos verificados sobre el papel de las tarjetas (>=3,0). El verde
  // oficial #7DC040 NO entra: queda en 1,96 sobre papel y no distingue series.
  const PALETTE = ["#5A9A28","#17655E","#2C5A22","#7E6015","#A63D2F","#3D7317","#6B6558","#8B4F3E","#9C6B4F","#B9DE8E"];
  const chartInstances = {};

  const hasChart = typeof Chart !== 'undefined';
  if(hasChart){
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.color = "#22201B";
    // 850ms era casi tres veces el presupuesto de una animación de interfaz
    // (300ms), multiplicado por los ocho gráficos del Panel. La primera vez
    // impresiona; a la décima estorba.
    Chart.defaults.animation = { duration: 300, easing: "easeOutQuart" };
  } else {
    console.error("[Registro de Turistas] Chart.js no cargó (CDN). Los gráficos del Panel no se mostrarán, pero el resto de la app funciona con normalidad.");
  }

  function pct(part, whole){
    if(!whole) return "0.0";
    return (part/whole*100).toFixed(1);
  }

  function destroyChart(id){
    if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; }
  }

  // Animated count-up for hero stat numbers — gives the dashboard a "live data" feel.
  function animateCount(el, endVal, opts){
    const isPct = !!(opts && opts.suffix === "%");
    const decimals = isPct ? 1 : 0;
    const duration = 900;
    const start = performance.now();
    function frame(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = endVal * eased;
      el.textContent = val.toLocaleString('es-CL', {minimumFractionDigits:decimals, maximumFractionDigits:decimals}) + (opts && opts.suffix ? opts.suffix : "");
      if(t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Doughnut with total shown in the center hole — a common "premium dashboard" touch.
  const centerTextPlugin = {
    id: "centerText",
    afterDraw(chart){
      if(!chart.config._centerText) return;
      const {ctx, chartArea} = chart;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 1.5rem 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#14150E";
      ctx.fillText(chart.config._centerText.value, cx, cy - 8);
      ctx.font = "600 0.7rem 'IBM Plex Sans', sans-serif";
      ctx.fillStyle = "#6B6558";
      ctx.fillText(chart.config._centerText.label, cx, cy + 14);
      ctx.restore();
    }
  };

  function makeDoughnut(canvasId, dataMap, total){
    if(!hasChart) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const labels = Object.keys(dataMap);
    const values = Object.values(dataMap);
    const colors = PALETTE.slice(0,labels.length);
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor:"#fff", borderWidth:3, hoverOffset: 6 }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        cutout: "68%",
        plugins:{
          legend:{ position:"bottom", labels:{ boxWidth:12, padding:14, usePointStyle:true, pointStyle:"circle" } },
          tooltip:{ callbacks:{ label: (c)=> `${c.label}: ${c.raw.toLocaleString('es-CL')} (${pct(c.raw, total)}%)` } }
        }
      },
      plugins: [centerTextPlugin]
    });
    chart.config._centerText = { value: total.toLocaleString('es-CL'), label: "turistas" };
    chart.update();
    chartInstances[canvasId] = chart;
  }

  // Tope del eje X para los gráficos de %. Antes estaba fijo en 100, así que un
  // gráfico cuya barra más alta era 11% dejaba el 89% del ancho vacío y ninguna
  // barra se podía comparar con otra. Ahora se ajusta al dato, subiendo al
  // siguiente corte "redondo" para que el eje siga siendo fácil de leer.
  // Cada tope va con SU paso, y el tope es siempre múltiplo del paso. Si no lo
  // fuera, Chart.js reparte las marcas con un paso propio y ADEMÁS dibuja la
  // del tope: con tope 35 salían 0-10-20-30 y un 35 pegado al 30, ilegible en
  // un eje de 150px. Por eso ya no existen los topes 25, 35 y 75.
  const ESCALAS_PCT = [
    [5,1], [10,5], [15,5], [20,5], [30,10], [40,10], [50,25], [60,20], [80,20], [100,25],
  ];
  function escalaPct(percents){
    const max = percents.length ? Math.max.apply(null, percents) : 0;
    const holgado = max * 1.05;
    for(const [tope,paso] of ESCALAS_PCT){ if(tope >= holgado) return { max:tope, paso }; }
    return { max:100, paso:25 };
  }

  // Parte una etiqueta larga en dos líneas por el espacio más cercano a la
  // mitad. Chart.js acepta un arreglo de textos y los apila.
  function partirEtiqueta(texto, limite = 16){
    const t = String(texto == null ? "" : texto);
    if(t.length <= limite) return t;
    const mitad = Math.floor(t.length / 2);
    let corte = -1, mejor = Infinity;
    for(let i = 0; i < t.length; i++){
      if(t[i] === " " && Math.abs(i - mitad) < mejor){ mejor = Math.abs(i - mitad); corte = i; }
    }
    if(corte === -1) return t;
    return [t.slice(0, corte), t.slice(corte + 1)];
  }

  function makePercentBar(canvasId, entries, denom, colorOffset){
    if(!hasChart) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const labels = entries.map(e=>e[0]);
    const counts = entries.map(e=>e[1]);
    const percents = counts.map(c => denom ? +(c/denom*100).toFixed(1) : 0);
    const baseColors = labels.map((_,i)=> PALETTE[(i+colorOffset) % PALETTE.length]);
    const esc = escalaPct(percents);
    chartInstances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{
        data: percents,
        backgroundColor: baseColors,
        borderRadius:6, maxBarThickness: 26
      }] },
      options: {
        indexAxis: "y",
        responsive:true, maintainAspectRatio:false,
        scales: {
          x: {
            min:0, max: esc.max,
            ticks:{
              stepSize: esc.paso,
              callback:(v)=>v+"%",
              // Red de seguridad: si aun asi no caben, se saltan marcas antes
              // que rotarlas o encimarlas.
              autoSkip:true, maxRotation:0,
            },
            grid:{ color:"rgba(34,32,27,0.08)" },
          },
          y: {
            grid:{ display:false },
            ticks:{
              // Chart.js RECORTA las etiquetas largas del eje sin avisar: "Visita
              // a familiares o amigos" se leía "a familiares o amigos", que dice
              // otra cosa. Devolver un arreglo las parte en dos líneas.
              // Solo se parte si la barra tiene alto para dos renglones. En los
              // gráficos de 18 categorías quedan 13px por barra: ahí dos líneas
              // se encimarían, que es peor que una recortada.
              callback: function(v, _i, marcas){
                const t = this.getLabelForValue(v);
                const altoPorBarra = this.height / Math.max(1, marcas.length);
                return altoPorBarra >= 26 ? partirEtiqueta(t) : t;
              },
              // Al ocupar dos líneas, Chart.js empezaba a saltarse categorías
              // enteras: desaparecían "Surf" y "Evento". Acá cada barra DEBE
              // tener su nombre; si aprietan, el que crece es el alto del
              // recuadro, no la lista de etiquetas.
              autoSkip:false,
            },
          }
        },
        plugins:{
          legend:{ display:false },
          tooltip:{ callbacks:{
            title: (it)=> labels[it[0].dataIndex],
            label: (c)=> `${c.raw}% (${counts[c.dataIndex].toLocaleString('es-CL')} de ${denom.toLocaleString('es-CL')})` } }
        }
      }
    });
  }

  // Daily-flow area chart across the whole date range — headline "flujo de turistas" visual.
  function makeFlujoChart(canvasId, recs){
    if(!hasChart) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const byDate = {};
    recs.forEach(r=>{ if(r.fecha) byDate[r.fecha] = (byDate[r.fecha]||0) + r.total; });
    const dates = Object.keys(byDate).sort();
    if(dates.length === 0) return;
    const start = parseLocalDate(dates[0]), end = parseLocalDate(dates[dates.length-1]);
    const allDates = [];
    for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      allDates.push(d.toISOString().slice(0,10));
    }
    const values = allDates.map(d=> byDate[d] || 0);
    const labels = allDates.map(d=>{
      const dt = parseLocalDate(d);
      return dt.toLocaleDateString('es-ES', {day:'2-digit', month:'short'});
    });
    chartInstances[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: "#2C5A22",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#2C5A22",
          tension: 0.35,
          fill: true,
          backgroundColor: "rgba(44,90,34,0.14)"
        }]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction: { mode:"index", intersect:false },
        scales: {
          x: { grid:{ display:false }, ticks:{ maxTicksLimit: 10, autoSkip:true } },
          y: { beginAtZero:true, grid:{ color:"rgba(34,32,27,0.08)" }, ticks:{ precision:0 } }
        },
        plugins:{
          legend:{ display:false },
          tooltip:{ callbacks:{
            title: (items)=> allDates[items[0].dataIndex] ? parseLocalDate(allDates[items[0].dataIndex]).toLocaleDateString('es-ES',{weekday:'long', day:'2-digit', month:'long'}) : "",
            label: (c)=> `${c.raw.toLocaleString('es-CL')} turistas`
          }}
        }
      }
    });
  }

  // ---------- Procedencia: región ⇄ comuna ----------
  // Con una temporada completa hay más de 120 comunas distintas y la mitad
  // aparece una sola vez: la vista por comuna sola es ilegible. Por defecto se
  // agrupa por región (12 barras que cubren el 100%) y el detalle fino queda a
  // un clic, porque son dos preguntas distintas: "dónde promociono" y "quién
  // exactamente está viniendo".
  let procedenciaVista = "region";   // "region" | "comuna"

  // Un par de nombres oficiales no caben como etiqueta y aplastan el gráfico.
  const REGION_CORTA = {
    "Metropolitana de Santiago": "R. Metropolitana",
    "Magallanes y de la Antártica Chilena": "Magallanes"
  };

  function procedenciaPorRegion(recs){
    const conteo = {};
    recs.forEach(r=>{
      // Un turista de afuera no tiene región chilena: se agrupa como "Extranjero".
      const clave = (r.pais && r.pais !== "Chile") ? "Extranjero" : (r.region || "Sin especificar");
      conteo[clave] = (conteo[clave]||0) + 1;
    });
    return Object.entries(conteo)
      .map(([k,v])=> [REGION_CORTA[k] || k, v])
      .sort((a,b)=>b[1]-a[1]);
  }

  // El gráfico muestra las N comunas principales. El resto NO se recorta en
  // silencio: se declara aparte, como nota bajo el gráfico. Se probó ponerlo
  // como una barra más ("Otras 112 comunas"), pero al ser un agregado del 56%
  // aplastaba a las comunas reales — justo lo que la vista quiere comparar.
  const PROC_TOP_N = 12;

  // ---------- Días de mayor afluencia ----------
  // Responde "¿qué días llega más gente al pueblo?". Es distinto del flujo
  // diario (que es la línea de tiempo): acá se agrupan todos los registros por
  // día de la semana, para ver el patrón que se repite temporada a temporada.
  const DIAS_SEMANA = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const DIAS_SEMANA_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  // Lunes = 0 ... Domingo = 6 (getDay() nativo devuelve Domingo = 0).
  // Devuelve -1 si la fecha no se puede interpretar, para no ensuciar los totales.
  function weekdayIndex(fecha){
    const d = parseLocalDate(fecha);
    if(isNaN(d.getTime())) return -1;
    return (d.getDay() + 6) % 7;
  }

  // Totales por día de la semana + cuántas jornadas distintas se registraron de
  // cada uno. Las jornadas importan: un rango de fechas casi nunca tiene la
  // misma cantidad de sábados que de lunes, así que el total solo no basta.
  function weekdayStats(recs){
    const totales = [0,0,0,0,0,0,0];
    const jornadas = [new Set(),new Set(),new Set(),new Set(),new Set(),new Set(),new Set()];
    recs.forEach(r=>{
      if(!r.fecha) return;
      const i = weekdayIndex(r.fecha);
      if(i < 0) return;
      totales[i] += r.total;
      jornadas[i].add(r.fecha);
    });
    return { totales, jornadas: jornadas.map(set=>set.size) };
  }

  function makeDiaSemanaChart(canvasId, recs){
    if(!hasChart) return;
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    const { totales, jornadas } = weekdayStats(recs);
    const max = Math.max.apply(null, totales);
    // Colores ESTÁTICOS, nunca funciones 'scriptable': Chart.js crasheaba el
    // Panel completo en Safari/iOS con colores calculados por callback
    // (ver README §6 y el fix del 2026-07-31). El día peak va en dorado.
    const colors = totales.map(v => (max > 0 && v === max) ? "#F2B33D" : "#5A9A28");
    chartInstances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels: DIAS_SEMANA_CORTO, datasets: [{
        data: totales,
        backgroundColor: colors,
        borderRadius: 6,
        maxBarThickness: 54
      }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales: {
          x: { grid:{ display:false } },
          y: { beginAtZero:true, grid:{ color:"rgba(34,32,27,0.08)" }, ticks:{ precision:0 } }
        },
        plugins:{
          legend:{ display:false },
          tooltip:{ callbacks:{
            title: (items)=> DIAS_SEMANA[items[0].dataIndex],
            label: (c)=> `${c.raw.toLocaleString('es-CL')} turistas en total`,
            afterLabel: (c)=>{
              const j = jornadas[c.dataIndex];
              if(!j) return "Sin jornadas registradas";
              const prom = (c.raw / j).toLocaleString('es-CL', {maximumFractionDigits:1});
              return `Promedio ${prom} por jornada · ${j} ${j===1?'día registrado':'días registrados'}`;
            }
          }}
        }
      }
    });
  }

  const STAT_ICONS = {
    turistas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    fem: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg>`,
    masc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.4 5.4M19 5h-5M19 5v5"/></svg>`,
    registros: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    surf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c4-6 8-8 20-8-2 8-8 14-14 16-2-2-4-5-6-8Z"/><path d="M2 20c6-1 12-4 16-9"/></svg>`
  };

  function renderPanel(){
    const el = $("panel-content");
    const recs = state.records;
    if(recs.length === 0){
      Object.keys(chartInstances).forEach(destroyChart);
      el.innerHTML = `<div class="empty-state">
        <div class="stamp-outline">◎</div>
        <p>Aún no hay registros. Agrega el primero desde la pestaña "Registrar".</p>
      </div>`;
      return;
    }
    try{
      renderPanelContent(el, recs);
    }catch(e){
      console.error("[Registro de Turistas] Error al renderizar el Panel:", e);
      el.innerHTML = `<div class="empty-state">
        <p style="color:var(--stamp); font-weight:600;">No se pudo mostrar el Panel.</p>
        <p style="font-size:0.8rem;">${escapeHtml(e.message || String(e))}</p>
        <p style="font-size:0.78rem; margin-top:10px;">Chart.js ${typeof Chart !== 'undefined' ? 'cargó correctamente' : 'NO cargó'}.</p>
      </div>`;
    }
  }

  function renderPanelContent(el, recs){
    const totalTuristas = recs.reduce((s,r)=>s+r.total,0);
    const totalFem = recs.reduce((s,r)=>s+r.femenino,0);
    const totalMasc = recs.reduce((s,r)=>s+r.masculino,0);
    const numRegistros = recs.length;

    const edades = {
      "Menor de 18": recs.reduce((s,r)=>s+r.edad_menor18,0),
      "18 – 29": recs.reduce((s,r)=>s+r.edad_18_29,0),
      "30 – 40": recs.reduce((s,r)=>s+r.edad_30_40,0),
      "41 – 50": recs.reduce((s,r)=>s+r.edad_41_50,0),
      "Mayor de 50": recs.reduce((s,r)=>s+r.edad_mayor50,0)
    };
    const totalEdades = Object.values(edades).reduce((a,b)=>a+b,0);
    const generoData = { "Femenino": totalFem, "Masculino": totalMasc };

    const atractivoCount = {};
    const servicioCount = {};
    const motivoCount = {};
    const procedenciaCount = {};
    recs.forEach(r=>{
      (r.atractivos||[]).forEach(a=> atractivoCount[a] = (atractivoCount[a]||0)+1);
      (r.servicios||[]).forEach(s=> servicioCount[s] = (servicioCount[s]||0)+1);
      if(r.motivo) motivoCount[r.motivo] = (motivoCount[r.motivo]||0)+1;
      if(r.procedencia) procedenciaCount[r.procedencia] = (procedenciaCount[r.procedencia]||0)+1;
    });
    const topAtractivos = Object.entries(atractivoCount).sort((a,b)=>b[1]-a[1]);
    const topServicios = Object.entries(servicioCount).sort((a,b)=>b[1]-a[1]);
    const topMotivos = Object.entries(motivoCount).sort((a,b)=>b[1]-a[1]);
    const topProcedencias = Object.entries(procedenciaCount).sort((a,b)=>b[1]-a[1]);

    // Afluencia: patrón por día de la semana + las fechas peak de la temporada.
    const { totales: diaTotales } = weekdayStats(recs);
    const maxDiaTotal = Math.max.apply(null, diaTotales);
    const topDiaSemana = maxDiaTotal > 0 ? DIAS_SEMANA[diaTotales.indexOf(maxDiaTotal)] : "";
    const turistasPorFecha = {};
    recs.forEach(r=>{ if(r.fecha) turistasPorFecha[r.fecha] = (turistasPorFecha[r.fecha]||0) + r.total; });
    const topFechas = Object.entries(turistasPorFecha).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxFechaTotal = topFechas.length ? topFechas[0][1] : 0;

    const fechas = recs.map(r=>r.fecha).filter(Boolean).sort();
    const rangeLabel = fechas.length ? (
      parseLocalDate(fechas[0]).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) + " — " +
      parseLocalDate(fechas[fechas.length-1]).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'})
    ) : "";

    const procRegion = procedenciaPorRegion(recs);
    const procComuna = topProcedencias.slice(0, PROC_TOP_N);
    const procResto = topProcedencias.slice(PROC_TOP_N);
    const procRestoRegistros = procResto.reduce((acc,e)=>acc+e[1], 0);
    const procDatos = { region: procRegion, comuna: procComuna };

    const topMotivo = topMotivos[0];
    const topMotivoPct = topMotivo ? pct(topMotivo[1], numRegistros) : "0.0";

    el.innerHTML = `
      <div class="panel-hero">
        <div>
          <h2 class="section-title">Panel general</h2>
          <p class="section-sub" style="margin:0;">${numRegistros.toLocaleString('es-CL')} registro${numRegistros===1?'':'s'} capturado${numRegistros===1?'':'s'} · análisis en porcentajes sobre el total.</p>
        </div>
        ${rangeLabel ? `<span class="season-badge"><span class="dot"></span>${rangeLabel}</span>` : ""}
      </div>

      <div class="stat-cards">
        <div class="stat-card"><div class="icon">${STAT_ICONS.turistas}</div><div class="num" data-count="${totalTuristas}">0</div><div class="lbl">Turistas totales</div></div>
        <div class="stat-card"><div class="icon">${STAT_ICONS.fem}</div><div class="num" data-count="${pct(totalFem,totalTuristas)}" data-suffix="%">0</div><div class="lbl">Femenino</div></div>
        <div class="stat-card"><div class="icon">${STAT_ICONS.masc}</div><div class="num" data-count="${pct(totalMasc,totalTuristas)}" data-suffix="%">0</div><div class="lbl">Masculino</div></div>
        <div class="stat-card"><div class="icon">${STAT_ICONS.registros}</div><div class="num" data-count="${numRegistros}">0</div><div class="lbl">Registros</div></div>
      </div>

      ${topMotivo ? `
      <div class="highlight-card">
        <div class="hl-icon">${STAT_ICONS.surf}</div>
        <div class="hl-body">
          <div class="hl-eyebrow">Motivo de viaje principal</div>
          <p class="hl-title">${escapeHtml(topMotivo[0])} — <span class="pct">${topMotivoPct}%</span></p>
          <p class="hl-sub">${topMotivo[1].toLocaleString('es-CL')} de ${numRegistros.toLocaleString('es-CL')} registros mencionan "${escapeHtml(topMotivo[0])}" como motivo del viaje.</p>
        </div>
      </div>` : ""}

      <div class="chart-grid">
        <div class="chart-card wide">
          <h3>Flujo diario de turistas</h3>
          <p class="chart-denom">Personas registradas por día durante la temporada</p>
          <div class="chart-box flujo"><canvas id="chart-flujo"></canvas></div>
        </div>
        <div class="chart-card wide">
          ${topDiaSemana ? `<span class="rank-badge">#1 ${escapeHtml(topDiaSemana)}</span>` : ""}
          <h3>Días de mayor afluencia</h3>
          <p class="chart-denom">Turistas registrados según el día de la semana — muestra qué días llega más gente a la comuna</p>
          <div class="afluencia-body">
            <div class="chart-box"><canvas id="chart-dia-semana"></canvas></div>
            <div class="peak-days">
              <div class="peak-title">Fechas peak</div>
              ${topFechas.length ? `<ol class="peak-list">
                ${topFechas.map(([f,v],i)=>`<li>
                  <span class="peak-rank">${i+1}</span>
                  <span class="peak-date">${escapeHtml(parseLocalDate(f).toLocaleDateString('es-ES',{weekday:'short', day:'2-digit', month:'short'}))}</span>
                  <span class="peak-bar"><span style="width:${maxFechaTotal ? (v/maxFechaTotal*100).toFixed(1) : 0}%"></span></span>
                  <span class="peak-val">${v.toLocaleString('es-CL')}</span>
                </li>`).join("")}
              </ol>` : `<p class="peak-empty">Aún no hay fechas con registros.</p>`}
            </div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Género</h3>
          <p class="chart-denom">% del total de turistas</p>
          <div class="chart-box"><canvas id="chart-genero"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Rango de edad</h3>
          <p class="chart-denom">% del total de turistas</p>
          <div class="chart-box"><canvas id="chart-edad"></canvas></div>
        </div>
        <div class="chart-card">
          <span class="rank-badge">#1 ${escapeHtml(topMotivo ? topMotivo[0] : "")}</span>
          <h3>Motivo del viaje</h3>
          <p class="chart-denom">% de los registros</p>
          <div class="chart-box tall"><canvas id="chart-motivo"></canvas></div>
        </div>
        <div class="chart-card">
          <span class="rank-badge" id="proc-badge"></span>
          <h3>Procedencia</h3>
          <p class="chart-denom" id="proc-denom"></p>
          <div class="viewtabs" id="proc-viewtabs">
            <button type="button" data-view="region">Región</button>
            <button type="button" data-view="comuna">Comuna</button>
          </div>
          <div class="chart-box taller"><canvas id="chart-procedencia"></canvas></div>
          <p class="chart-nota" id="proc-nota"></p>
        </div>
        <div class="chart-card wide">
          <span class="rank-badge">#1 ${escapeHtml(topAtractivos[0] ? topAtractivos[0][0] : "")}</span>
          <h3>Atractivos turísticos más consultados</h3>
          <p class="chart-denom">% de los registros que mencionan cada atractivo</p>
          <div class="chart-box tall"><canvas id="chart-atractivos"></canvas></div>
        </div>
        <div class="chart-card wide">
          <span class="rank-badge">#1 ${escapeHtml(topServicios[0] ? topServicios[0][0] : "")}</span>
          <h3>Servicios turísticos más consultados</h3>
          <p class="chart-denom">% de los registros que mencionan cada servicio</p>
          <div class="chart-box tall"><canvas id="chart-servicios"></canvas></div>
        </div>
      </div>
    `;

    el.querySelectorAll('.stat-card .num[data-count]').forEach(node=>{
      const end = parseFloat(node.dataset.count) || 0;
      animateCount(node, end, { suffix: node.dataset.suffix || "" });
    });

    makeFlujoChart("chart-flujo", recs);
    makeDiaSemanaChart("chart-dia-semana", recs);
    makeDoughnut("chart-genero", generoData, totalTuristas);
    makePercentBar("chart-edad", Object.entries(edades), totalEdades, 3);
    makePercentBar("chart-motivo", topMotivos, numRegistros, 1);
    function pintarProcedencia(){
      const entries = procDatos[procedenciaVista];
      makePercentBar("chart-procedencia", entries, numRegistros, 0);
      const badge = $("proc-badge");
      const denom = $("proc-denom");
      if(badge) badge.textContent = entries[0] ? "#1 " + entries[0][0] : "";
      if(denom) denom.textContent = procedenciaVista === "region"
        ? "% de los registros — agrupado por región de origen"
        : `% de los registros — las ${PROC_TOP_N} comunas principales`;
      const nota = $("proc-nota");
      if(nota){
        if(procedenciaVista === "comuna" && procResto.length){
          nota.textContent = `Fuera del gráfico: otras ${procResto.length.toLocaleString('es-CL')} procedencias suman ${procRestoRegistros.toLocaleString('es-CL')} registros (${pct(procRestoRegistros, numRegistros).replace(".", ",")}% del total).`;
        } else {
          nota.textContent = "";
        }
      }
      el.querySelectorAll("#proc-viewtabs button").forEach(b=>{
        b.classList.toggle("active", b.dataset.view === procedenciaVista);
      });
    }
    el.querySelectorAll("#proc-viewtabs button").forEach(b=>{
      b.addEventListener("click", ()=>{
        procedenciaVista = b.dataset.view;
        pintarProcedencia();
      });
    });
    pintarProcedencia();
    makePercentBar("chart-atractivos", topAtractivos, numRegistros, 2);
    makePercentBar("chart-servicios", topServicios, numRegistros, 4);
  }

  // ---------- Registros eliminados ----------
  // El borrado es lógico: el registro sigue en la base, marcado. Esta vista es
  // lo que hace que eso sirva de algo sin tener que entrar a la base a mano.
  let eliminadosVisibles = false;

  async function cargarEliminados(){
    const cont = $("eliminados-panel");
    cont.innerHTML = `<div class="eliminados-caja"><p class="eliminados-sub">Buscando registros eliminados…</p></div>`;
    try{
      const res = await fetch('/api/records/eliminados');
      if(res.status === 401){
        sesionIniciada = false;
        volverAlLogin("Tu sesión venció. Vuelve a escribir la clave.");
        return;
      }
      if(!res.ok) throw new Error('respuesta no OK');
      const data = await res.json();
      renderEliminados(data.records || []);
    }catch(e){
      console.error('[Registro de Turistas] No se pudieron cargar los eliminados.', e);
      cont.innerHTML = `<div class="eliminados-caja"><p class="eliminados-sub">No se pudieron cargar los registros eliminados.</p></div>`;
    }
  }

  function renderEliminados(lista){
    const cont = $("eliminados-panel");
    if(!lista.length){
      cont.innerHTML = `<div class="eliminados-caja"><p class="eliminados-sub">No hay registros eliminados.</p></div>`;
      return;
    }
    cont.innerHTML = `<div class="eliminados-caja">
      <h3>Registros eliminados (${lista.length.toLocaleString('es-CL')})</h3>
      <p class="eliminados-sub">No se borraron de la base: quedaron ocultos. Puedes devolverlos al historial.</p>
      ${lista.map(r=>{
        const cuando = r.fecha ? parseLocalDate(r.fecha).toLocaleDateString('es-ES',{day:'2-digit', month:'short', year:'numeric'}) : (r.fecha||"");
        let borrado = "";
        if(r.eliminado_en){
          const d = new Date(r.eliminado_en);
          if(!isNaN(d.getTime())) borrado = d.toLocaleString('es-CL',{day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
        }
        return `<div class="eliminado-item">
          <div class="eliminado-datos">
            <div class="proc">${escapeHtml(r.procedencia || "—")} · ${r.total} turista${r.total===1?'':'s'}</div>
            <div class="eliminado-meta">Registro del ${escapeHtml(cuando)}${borrado ? " · eliminado el " + escapeHtml(borrado) : ""}${r.eliminado_por ? " por " + escapeHtml(r.eliminado_por) : ""}</div>
          </div>
          <button class="toolbar-btn restaurar-btn" data-id="${escapeAttr(r.id)}">Restaurar</button>
        </div>`;
      }).join("")}
    </div>`;

    cont.querySelectorAll('.restaurar-btn').forEach(b=>{
      b.addEventListener('click', async ()=>{
        b.disabled = true;
        try{
          const res = await fetch('/api/records/'+encodeURIComponent(b.dataset.id)+'/restaurar', {method:'POST'});
          if(res.status === 401){
            sesionIniciada = false;
            volverAlLogin("Tu sesión venció. Vuelve a escribir la clave.");
            return;
          }
          if(!res.ok) throw new Error('respuesta no OK');
        }catch(e){
          console.error('[Registro de Turistas] No se pudo restaurar.', e);
          alert('No se pudo restaurar el registro. Intenta de nuevo.');
          b.disabled = false;
          return;
        }
        await refreshFromApi();
        renderHistorial();
        renderPanel();
        await cargarEliminados();
      });
    });
  }

  $("ver-eliminados-btn").addEventListener("click", async ()=>{
    eliminadosVisibles = !eliminadosVisibles;
    $("eliminados-panel").classList.toggle("hidden", !eliminadosVisibles);
    $("ver-eliminados-btn").textContent = eliminadosVisibles ? "Ocultar eliminados" : "Ver eliminados";
    if(eliminadosVisibles) await cargarEliminados();
  });

  // ---------- Historial ----------
  // ---------- Historial agrupado por mes y día ----------
  // Con una temporada completa son más de mil registros repartidos en 92 días:
  // ni la lista corrida ni la lista de días eran recorribles. Se agrupa en dos
  // niveles —mes y día— y CADA NIVEL pinta su contenido solo al abrirse, así el
  // DOM nunca carga con lo que nadie está mirando.
  const mesesAbiertos = new Set();
  const diasAbiertos = new Set();
  let historialPorMes = {};

  function tarjetaRegistro(r){
    return `
      <div class="record-card" data-id="${escapeAttr(r.id)}">
        <div class="record-top">
          <div class="record-main">
            <div class="proc">${escapeHtml(r.procedencia)}</div>
            <div class="meta">${r.total} turistas (${r.femenino} F · ${r.masculino} M) — ${escapeHtml(r.motivo)}${r.informador ? " · registrado por " + escapeHtml(r.informador) : ""}</div>
            <div class="record-tags">
              ${(r.atractivos||[]).map(a=>`<span class="tag">${escapeHtml(a)}</span>`).join("")}
              ${(r.servicios||[]).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>
          <button class="del-btn" data-id="${escapeAttr(r.id)}">Eliminar</button>
        </div>
      </div>`;
  }

  function nombreDelDia(fecha){
    const d = parseLocalDate(fecha);
    if(isNaN(d.getTime())) return fecha;
    const t = d.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function engancharBorrado(contenedor){
    contenedor.querySelectorAll(".del-btn").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.dataset.id;
        const reg = state.records.find(r=>r.id === id);
        if(!reg) return;

        // Se confirma mostrando de cuál registro se trata, no un "¿estás
        // seguro?" a ciegas.
        const cuando = reg.fecha ? parseLocalDate(reg.fecha).toLocaleDateString('es-ES',{day:'2-digit', month:'long', year:'numeric'}) : reg.fecha;
        const detalle = `${reg.total} turista${reg.total===1?'':'s'} de ${reg.procedencia || 'procedencia sin especificar'}\ndel ${cuando}`;
        const aviso = useApi
          ? "\n\nSe puede recuperar después con “Ver eliminados”."
          : "\n\nEn este dispositivo el borrado no se puede deshacer.";
        if(!confirm("¿Eliminar este registro?\n\n" + detalle + aviso)) return;

        if(useApi){
          try{
            const res = await fetch('/api/records/'+encodeURIComponent(id), {
              method:'DELETE',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ informador: state.currentUser || "" })
            });
            if(res.status === 401){
              sesionIniciada = false;
              volverAlLogin("Tu sesión venció. Vuelve a escribir la clave.");
              return;
            }
            if(!res.ok) throw new Error('respuesta no OK del servidor');
          }catch(e){
            // Si el servidor no lo acepta, la vista NO se toca: antes decía
            // "borrado" con el registro intacto en la base.
            console.error('No se pudo eliminar el registro en el servidor', e);
            alert('No se pudo eliminar el registro: sin conexión con el servidor. Sigue estando ahí.');
            return;
          }
        }
        state.records = state.records.filter(r=>r.id !== id);
        if(!useApi) await saveState();
        renderHistorial();
        renderPanel();
      });
    });
  }

  function nombreDelMes(ym){
    const [y,m] = ym.split("-").map(Number);
    if(!y || !m) return ym;
    const t = new Date(y, m-1, 1).toLocaleDateString('es-ES', {month:'long', year:'numeric'});
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function resumen(regs){
    const turistas = regs.reduce((acc,r)=>acc+r.total, 0);
    return `${regs.length} ${regs.length===1?'registro':'registros'} · ${turistas.toLocaleString('es-CL')} ${turistas===1?'turista':'turistas'}`;
  }

  function abrirDia(grupo){
    const fecha = grupo.dataset.fecha;
    const cuerpo = grupo.querySelector(".dia-cuerpo");
    if(!cuerpo.dataset.pintado){
      const regs = (historialPorMes[fecha.slice(0,7)] || {})[fecha] || [];
      cuerpo.innerHTML = `<div class="acordeon-int">${regs.map(tarjetaRegistro).join("")}</div>`;
      cuerpo.dataset.pintado = "1";
      engancharBorrado(cuerpo);
    }
    grupo.classList.add("abierto");
    diasAbiertos.add(fecha);
  }

  function cerrarDia(grupo){
    grupo.classList.remove("abierto");
    diasAbiertos.delete(grupo.dataset.fecha);
  }

  function abrirMes(grupo){
    const ym = grupo.dataset.mes;
    const cuerpo = grupo.querySelector(".mes-cuerpo");
    if(!cuerpo.dataset.pintado){
      const dias = Object.keys(historialPorMes[ym] || {}).sort().reverse();
      // El envoltorio existe para animar el despliegue: la fila de grid pasa de
      // 0fr a 1fr y este div recorta lo que sobra mientras crece.
      cuerpo.innerHTML = `<div class="acordeon-int">` + dias.map(f=>`
        <div class="dia-grupo" data-fecha="${escapeAttr(f)}">
          <button type="button" class="dia-cabecera">
            <span class="dia-flecha" aria-hidden="true">▸</span>
            <span class="dia-fecha">${escapeHtml(nombreDelDia(f))}</span>
            <span class="dia-conteo">${resumen(historialPorMes[ym][f])}</span>
          </button>
          <div class="dia-cuerpo"></div>
        </div>`).join("") + `</div>`;
      cuerpo.dataset.pintado = "1";
      cuerpo.querySelectorAll(".dia-grupo").forEach(g=>{
        g.querySelector(".dia-cabecera").addEventListener("click", ()=>{
          g.classList.contains("abierto") ? cerrarDia(g) : abrirDia(g);
        });
        if(diasAbiertos.has(g.dataset.fecha)) abrirDia(g);
      });
    }
    grupo.classList.add("abierto");
    mesesAbiertos.add(ym);
  }

  function cerrarMes(grupo){
    grupo.classList.remove("abierto");
    mesesAbiertos.delete(grupo.dataset.mes);
  }

  function renderHistorial(){
    const el = $("historial-list");
    if(state.records.length === 0){
      el.innerHTML = `<div class="empty-state">
        <div class="stamp-outline">◎</div>
        <p>No hay registros todavía.</p>
      </div>`;
      return;
    }

    historialPorMes = {};
    state.records.forEach(r=>{
      const f = r.fecha || "sin fecha";
      const ym = f.slice(0,7);
      historialPorMes[ym] = historialPorMes[ym] || {};
      (historialPorMes[ym][f] = historialPorMes[ym][f] || []).push(r);
    });
    const meses = Object.keys(historialPorMes).sort().reverse();

    // El mes y el día más recientes se abren solos: es lo que se viene a ver.
    if(mesesAbiertos.size === 0 && meses.length){
      mesesAbiertos.add(meses[0]);
      const primerDia = Object.keys(historialPorMes[meses[0]]).sort().reverse()[0];
      if(primerDia) diasAbiertos.add(primerDia);
    }

    el.innerHTML = meses.map(ym=>{
      const regs = Object.values(historialPorMes[ym]).flat();
      const nDias = Object.keys(historialPorMes[ym]).length;
      return `<div class="mes-grupo" data-mes="${escapeAttr(ym)}">
        <button type="button" class="mes-cabecera">
          <span class="mes-flecha" aria-hidden="true">▸</span>
          <span class="mes-nombre">${escapeHtml(nombreDelMes(ym))}</span>
          <span class="mes-conteo">${nDias} ${nDias===1?'día':'días'} · ${resumen(regs)}</span>
        </button>
        <div class="mes-cuerpo"></div>
      </div>`;
    }).join("");

    el.querySelectorAll(".mes-grupo").forEach(grupo=>{
      grupo.querySelector(".mes-cabecera").addEventListener("click", ()=>{
        grupo.classList.contains("abierto") ? cerrarMes(grupo) : abrirMes(grupo);
      });
      if(mesesAbiertos.has(grupo.dataset.mes)) abrirMes(grupo);
    });
  }

  // ---------- Export CSV ----------
  $("export-btn").addEventListener("click", ()=>{
    if(state.records.length === 0) return;
    const headers = ["fecha","procedencia","informador","femenino","masculino","total","edad_menor18","edad_18_29","edad_30_40","edad_41_50","edad_mayor50","motivo","atractivos","servicios","pais","region","comuna"];
    const rows = state.records.map(r=> headers.map(h=>{
      let v = r[h];
      if(Array.isArray(v)) v = v.join(" | ");
      v = (v===undefined || v===null) ? "" : String(v);
      return '"' + v.replace(/"/g,'""') + '"';
    }).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registro-turistas.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- Excel database export (Registros + Análisis con fórmulas) ----------
  $("export-xlsx-btn").addEventListener("click", async ()=>{
    if(state.records.length === 0){ alert("Aún no hay registros para exportar."); return; }
    const btn = $("export-xlsx-btn");
    const textoOriginal = btn.textContent;

    // El informe se arma en el servidor: la versión libre de SheetJS, que es la
    // que corre en el navegador, no escribe estilos de celda y por eso el
    // archivo salía sin colores ni bordes.
    if(!useApi){
      alert("El informe en Excel se genera en el servidor. Sin conexión al servidor compartido solo está disponible la exportación a CSV.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Generando informe…";
    try{
      const res = await fetch('/api/export/excel');
      if(res.status === 401){
        sesionIniciada = false;
        volverAlLogin("Tu sesión venció. Vuelve a escribir la clave.");
        return;
      }
      if(!res.ok) throw new Error('respuesta no OK del servidor');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "informe-registro-turistas-" + todayStr() + ".xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
    }catch(e){
      console.error('[Registro de Turistas] No se pudo generar el informe.', e);
      alert('No se pudo generar el informe. Revisa tu conexión e intenta de nuevo.');
    }finally{
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });

  function escapeHtml(str){
    return String(str||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }
  function escapeAttr(str){ return escapeHtml(str); }

  async function hasExistingData(){
    try{
      const res = await window.__storageAdapter.get(STORAGE_KEY, true);
      return !!(res && res.value);
    }catch(e){
      return false;
    }
  }

  // ¿Estamos en un ambiente de pruebas? Los datos simulados NUNCA pueden entrar
  // a la base compartida ni aparecerle a un informador en terreno: quedarían
  // indistinguibles de los registros reales y no hay forma de separarlos después.
  function esAmbienteLocal(){
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "" || h.endsWith(".local");
  }

  async function bootstrap(){
    const pideSeed = new URLSearchParams(location.search).get('seed') === '1';

    await iniciarPantallaLogin();

    if(!hasNativeStorage){
      if(apiDisponible){
        // Con backend compartido no se siembra NADA, ni aunque la base esté
        // vacía. Y si todavía no hay sesión, los datos se cargan al ingresar.
        if(sesionIniciada) await loadState();
        return;
      }
      try{
        const recRes = await fetch('/api/records');
        if(recRes.ok){
          // Con base compartida no se siembra NADA, ni aunque esté vacía.
          // Antes acá se auto-importaba el set de demostración cuando la base
          // devolvía 0 registros: bastaba que alguien borrara el último registro
          // real para llenar producción de datos falsos.
          loadState();
          return;
        }
      }catch(e){
        // Sin API (hosting estático o sin conexión): sigue con localStorage.
      }
    }

    // El set de demostración solo existe en local. En cualquier otro host la app
    // parte vacía, como corresponde.
    if(esAmbienteLocal() && (pideSeed || !(await hasExistingData()))){
      try{
        const res = await fetch('seed-data.json');
        const seed = await res.json();
        await window.__storageAdapter.set(STORAGE_KEY, JSON.stringify(seed), true);
      }catch(e){
        console.error('[Registro de Turistas] No se pudo cargar el set de datos de demostración.', e);
      }
    }
    loadState();
  }

  // ======================= INFORME (pestaña) =======================
  // El informe de presentación. El Excel quedó como planilla de trabajo; esto es
  // lo que se le muestra al concejo o se manda en PDF. La narrativa NO se calcula
  // acá: viene de /api/informe, que ejecuta las mismas funciones que arma el
  // Excel. Una sola fuente, para que los dos no puedan contradecirse.

  const INF = {
    verde:"#5A9A28", verdeClaro:"#7DC040", verde700:"#3D7317", verde800:"#264E0E",
    oro:"#F2B33D", mar:"#17655E", marClaro:"#2FB3A8", tierra:"#A63D2F", tinta:"#14150E",
  };
  // Serie fija para las categóricas. Estática a propósito: Chart.js con colores
  // calculados por callback tumbaba el Panel entero en Safari/iOS.
  const INF_SERIE = [INF.verdeClaro, INF.mar, INF.oro, INF.verde700, INF.marClaro, INF.tierra, INF.verde800, "#6B6558"];

  let informeCargado = false;

  const nf = (n) => (Number(n)||0).toLocaleString('es-CL');
  const nf1 = (n) => (Number(n)||0).toLocaleString('es-CL',{minimumFractionDigits:1, maximumFractionDigits:1});

  function mesLargo(ym){
    const M = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const [a,m] = String(ym).split("-");
    return M[Number(m)-1] ? `${M[Number(m)-1]} ${a}` : ym;
  }
  function fechaLarga(iso){
    if(!iso) return "";
    const [a,m,d] = String(iso).split("-").map(Number);
    const M = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${d} de ${M[m-1]} de ${a}`;
  }
  // "2026-12-21" -> "21 dic". Las fechas ISO completas en el eje X salían
  // pegadas unas con otras y se leían como un solo número largo.
  function fechaCorta(iso){
    const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const [a,m,d] = String(iso||"").split("-").map(Number);
    return (m && d) ? `${d} ${M[m-1]}` : String(iso||"");
  }
  const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // Convierte el texto narrado (con saltos de línea) en párrafos.
  function parrafos(texto){
    return String(texto||"").split("\n").filter(l=>l.trim())
      .map(l=>`<p>${esc(l)}</p>`).join("");
  }

  function bloqueRanking(titulo, entradas, denom, unidad, limite){
    const top = (entradas||[]).slice(0, limite||6);
    if(!top.length) return "";
    const max = top[0] ? top[0][1] : 0;
    const filas = top.map(([k,v],i)=>{
      const ancho = max ? Math.round(v/max*100) : 0;
      // pct() devuelve punto decimal; el texto narrado usa coma. Sin esto el
      // mismo documento mostraba "46,0%" en el párrafo y "62.8%" en la lista.
      const p = denom ? ` · ${pct(v,denom).replace(".", ",")}%` : "";
      return `<li><span class="rk-n">${i+1}</span>
        <span class="rk-txt">${esc(k)}</span>
        <span class="rk-bar"><i style="width:${ancho}%"></i></span>
        <span class="rk-val">${nf(v)}${p}</span></li>`;
    }).join("");
    return `<div class="rk"><h4>${esc(titulo)}</h4><ol>${filas}</ol>
      <p class="rk-pie">${esc(unidad||"")}</p></div>`;
  }

  function seccionHTML(n, sec, extra){
    // El título ya viene numerado desde el servidor ("1. Cuánta gente llegó…").
    // Como acá el número va en su propio círculo, se le quita el prefijo para
    // que no salga dos veces.
    const titulo = String(sec.titulo||"").replace(/^\s*\d+\.\s*/, "");
    return `<section class="inf-sec" id="inf-sec-${n}">
      <h3><span class="inf-num">${n}</span>${esc(titulo)}</h3>
      <div class="inf-texto">${parrafos(sec.texto)}</div>
      ${extra||""}
    </section>`;
  }

  function lienzo(id, alto){
    return `<div class="inf-chart" style="height:${alto||260}px"><canvas id="${id}"></canvas></div>`;
  }

  async function renderInforme(forzar){
    const doc = $("informe-doc");
    if(!doc) return;
    if(informeCargado && !forzar) return;
    doc.innerHTML = `<p class="inf-cargando">Preparando el informe…</p>`;

    let data;
    try{
      const res = await fetch('/api/informe');
      if(res.status === 401){ volverAlLogin(); return; }
      if(res.status === 404){
        doc.innerHTML = `<div class="inf-vacio"><h2>Todavía no hay registros</h2>
          <p>El informe se arma solo cuando haya al menos una atención registrada.</p></div>`;
        return;
      }
      if(!res.ok) throw new Error('informe no disponible');
      data = await res.json();
    }catch(e){
      doc.innerHTML = `<div class="inf-vacio"><h2>No se pudo armar el informe</h2>
        <p>Revisa la conexión y vuelve a intentar con el botón Actualizar.</p></div>`;
      return;
    }

    const a = data.analisis, secs = data.secciones || [];
    const hoy = new Date();
    const emitido = `${hoy.getDate()} de ${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][hoy.getMonth()]} de ${hoy.getFullYear()}`;

    const kpis = [
      ["Turistas atendidos", nf(a.turistas), "personas"],
      ["Atenciones registradas", nf(a.n), "grupos"],
      ["Grupo promedio", nf1(a.grupoMedio), "personas por grupo"],
      ["Días con actividad", nf(a.diasConRegistro), "jornadas"],
    ].map(([t,v,u])=>`<div class="inf-kpi"><span class="k-t">${t}</span>
        <span class="k-v">${v}</span><span class="k-u">${u}</span></div>`).join("");

    doc.innerHTML = `
      <header class="inf-portada">
        <div class="inf-portada-txt">
          <p class="inf-org">I. Municipalidad de Cobquecura · La Costa de Ñuble</p>
          <h1>Informe de Registro de Turistas</h1>
          <p class="inf-periodo">Período del ${fechaLarga(a.desde)} al ${fechaLarga(a.hasta)}</p>
        </div>
        <p class="inf-emitido">Emitido el ${emitido}</p>
      </header>

      <div class="inf-kpis">${kpis}</div>

      ${secs[0] ? seccionHTML(1, secs[0], `
        <div class="inf-grid-2">
          ${lienzo("inf-ch-mes", 260)}
          ${lienzo("inf-ch-flujo", 260)}
        </div>`) : ""}

      ${secs[1] ? seccionHTML(2, secs[1], lienzo("inf-ch-dia", 280)) : ""}

      ${secs[2] ? seccionHTML(3, secs[2], `
        <div class="inf-grid-2">
          ${lienzo("inf-ch-region", 280)}
          ${bloqueRanking("Orígenes más frecuentes", a.porProcedencia, a.n, "Grupos por comuna de origen; los extranjeros figuran por su país.", 6)}
        </div>`) : ""}

      ${secs[3] ? seccionHTML(4, secs[3], `
        <div class="inf-grid-2">
          ${lienzo("inf-ch-sexo", 260)}
          ${lienzo("inf-ch-edad", 260)}
        </div>`) : ""}

      ${secs[4] ? seccionHTML(5, secs[4], lienzo("inf-ch-motivo", 300)) : ""}

      ${secs[5] ? seccionHTML(6, secs[5], `
        <div class="inf-grid-2">
          ${bloqueRanking("Atractivos más consultados", a.atractivos, a.n, "Veces que se mencionó en una atención.", 7)}
          ${bloqueRanking("Servicios más requeridos", a.servicios, a.n, "Veces que se mencionó en una atención.", 7)}
        </div>`) : ""}

      <section class="inf-conclusion">
        <h3>En resumen</h3>
        ${parrafos(data.conclusion)}
      </section>

      <footer class="inf-pie">
        <p>Registro de Turistas · I. Municipalidad de Cobquecura</p>
        <p>Informe generado automáticamente a partir de ${nf(data.total)} atenciones registradas.</p>
      </footer>`;

    dibujarGraficosInforme(a);
    informeCargado = true;
  }

  function dibujarGraficosInforme(a){
    if(!hasChart) return;
    // Sin animación: si el usuario imprime apenas abre, un canvas a medio animar
    // se congela en el PDF a medio dibujar.
    const base = {
      responsive:true, maintainAspectRatio:false,
      animation:false,
      plugins:{ legend:{ display:false } },
    };
    const ejeY = { beginAtZero:true, grid:{ color:"rgba(20,21,14,0.08)" }, ticks:{ precision:0 } };
    const ejeXlimpio = { grid:{ display:false } };

    const mk = (id, cfg) => {
      const el = document.getElementById(id);
      if(!el) return;
      destroyChart(id);
      chartInstances[id] = new Chart(el, cfg);
    };

    // 1a. Turistas por mes
    const meses = a.porMes || [];
    mk("inf-ch-mes", {
      type:"bar",
      data:{ labels: meses.map(m=>mesLargo(m[0])), datasets:[{ data: meses.map(m=>m[1]),
        backgroundColor: INF.verdeClaro, borderRadius:6, maxBarThickness:56 }] },
      options:{ ...base, scales:{ x:ejeXlimpio, y:ejeY },
        plugins:{ ...base.plugins, title:{ display:true, text:"Turistas por mes", font:{size:13,weight:"600"} } } }
    });

    // 1b. Flujo diario (línea) — se ordena por fecha, no por magnitud
    const flujo = [...(a.porFecha||[])].sort((x,y)=> x[0]<y[0]?-1:1);
    mk("inf-ch-flujo", {
      type:"line",
      // Etiqueta corta en el eje; la fecha completa queda en el tooltip.
      data:{ labels: flujo.map(f=>fechaCorta(f[0])), datasets:[{ data: flujo.map(f=>f[1]),
        borderColor: INF.mar, backgroundColor:"rgba(23,101,94,0.12)",
        fill:true, tension:0.3, pointRadius:0, borderWidth:2 }] },
      options:{ ...base,
        scales:{ x:{ ...ejeXlimpio,
          ticks:{ maxTicksLimit:5, maxRotation:0, autoSkip:true, padding:4, font:{size:10} } }, y:ejeY },
        plugins:{ ...base.plugins,
          tooltip:{ callbacks:{ title:(it)=> flujo[it[0].dataIndex] ? fechaLarga(flujo[it[0].dataIndex][0]) : "" } },
          title:{ display:true, text:"Flujo diario de turistas", font:{size:13,weight:"600"} } } }
    });

    // 2. Día de la semana — el peak en dorado
    const dias = a.porDiaSemana || [];
    const maxDia = Math.max.apply(null, dias.map(d=>d[1]).concat([0]));
    mk("inf-ch-dia", {
      type:"bar",
      data:{ labels: DIAS_SEMANA_CORTO, datasets:[{ data: dias.map(d=>d[1]),
        backgroundColor: dias.map(d => (maxDia>0 && d[1]===maxDia) ? INF.oro : INF.verde),
        borderRadius:6, maxBarThickness:60 }] },
      options:{ ...base, scales:{ x:ejeXlimpio, y:ejeY },
        plugins:{ ...base.plugins, title:{ display:true, text:"Turistas acumulados por día de la semana", font:{size:13,weight:"600"} } } }
    });

    // 3. Procedencia por región (barras horizontales: los nombres son largos)
    const reg = (a.porRegion||[]).slice(0,8);
    // En barras horizontales el nombre largo se come el área del gráfico y en
    // pantalla angosta queda cortado por la izquierda.
    const cortoReg = (t)=>{
      const s = String(t||"");
      if(s.length <= 20) return s;
      return s.replace(/^Metropolitana de Santiago$/, "R. Metropolitana")
              .replace(/^Libertador General Bernardo O.Higgins$/, "O'Higgins")
              .replace(/^Aysén del General Carlos Ibáñez del Campo$/, "Aysén")
              .replace(/^Magallanes.*$/, "Magallanes")
              .slice(0, 22);
    };
    mk("inf-ch-region", {
      type:"bar",
      data:{ labels: reg.map(r=>cortoReg(r[0])), datasets:[{ data: reg.map(r=>r[1]),
        backgroundColor: reg.map((_,i)=>INF_SERIE[i % INF_SERIE.length]), borderRadius:5 }] },
      options:{ ...base, indexAxis:"y",
        scales:{ x:{ beginAtZero:true, grid:{ color:"rgba(20,21,14,0.08)" }, ticks:{precision:0} }, y:{ grid:{display:false} } },
        plugins:{ ...base.plugins,
          tooltip:{ callbacks:{ title:(it)=> reg[it[0].dataIndex] ? reg[it[0].dataIndex][0] : "" } },
          title:{ display:true, text:"Grupos por región de origen", font:{size:13,weight:"600"} } } }
    });

    // 4a. Sexo
    mk("inf-ch-sexo", {
      type:"doughnut",
      data:{ labels:["Femenino","Masculino"], datasets:[{ data:[a.femenino||0, a.masculino||0],
        backgroundColor:[INF.oro, INF.mar], borderWidth:2, borderColor:"#FFFFFF" }] },
      options:{ ...base, cutout:"58%",
        plugins:{ legend:{ display:true, position:"bottom" },
          title:{ display:true, text:"Composición por sexo", font:{size:13,weight:"600"} } } }
    });

    // 4b. Tramos de edad
    const ed = a.edades || [];
    mk("inf-ch-edad", {
      type:"bar",
      data:{ labels: ed.map(e=>e[0]), datasets:[{ data: ed.map(e=>e[1]),
        backgroundColor: INF.verde700, borderRadius:5, maxBarThickness:48 }] },
      options:{ ...base, scales:{ x:{ ...ejeXlimpio, ticks:{ maxRotation:0, autoSkip:false, font:{size:10} } }, y:ejeY },
        plugins:{ ...base.plugins, title:{ display:true, text:"Personas por tramo de edad", font:{size:13,weight:"600"} } } }
    });

    // 5. Motivo de viaje
    const mot = (a.porMotivo||[]).slice(0,8);
    mk("inf-ch-motivo", {
      type:"bar",
      data:{ labels: mot.map(m=>m[0]), datasets:[{ data: mot.map(m=>m[1]),
        backgroundColor: mot.map((_,i)=>INF_SERIE[i % INF_SERIE.length]), borderRadius:5 }] },
      options:{ ...base, indexAxis:"y",
        scales:{ x:{ beginAtZero:true, grid:{ color:"rgba(20,21,14,0.08)" }, ticks:{precision:0} }, y:{ grid:{display:false} } },
        plugins:{ ...base.plugins, title:{ display:true, text:"Motivo declarado del viaje", font:{size:13,weight:"600"} } } }
    });
  }

  bootstrap();
})();

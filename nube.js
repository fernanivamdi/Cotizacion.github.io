/* =====================================================================
   nube.js  —  Sincronización con Supabase (sin login)
   Guarda en la nube lo que las páginas guardan en el navegador, para ver
   los mismos datos desde cualquier dispositivo.
   Tabla usada: public.app_state (clave, parte, valor, total, actualizado_en)
   ===================================================================== */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://xzquhkcdifgqjksjxqaf.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cXVoa2NkaWZncWprc2p4cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NjI2NjgsImV4cCI6MjEwODUzODY2OH0.fsHae5Y9oxttT1LOlSqAYJJNWHwAPmTVc3ToHlxSm1Y';
  const TABLA = SUPABASE_URL + '/rest/v1/app_state';
  const CLAVE_IDB = 'idb_proveedores';
  const TAM_PARTE = 700000;      // caracteres por fila
  const ESPERA_PUSH = 2500;      // ms de espera antes de subir cambios
  const TIMEOUT_INICIO = 6000;   // ms máximo esperando a la nube al abrir

  // Claves de localStorage que se sincronizan (inv_vistaActual queda local a propósito)
  const CLAVES_LS = new Set([
    'inv_datosCombinados', 'inv_stockEditado', 'inv_stockLinea', 'inv_noDisponible',
    'cotizacion_pedidos_productosMatriz', 'cotizacion_pedidos_productosSucursal',
    'cotizacion_pedidos_manualesMatriz', 'cotizacion_pedidos_manualesSucursal'
  ]);

  const HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

  const _set = Storage.prototype.setItem;
  const _get = Storage.prototype.getItem;
  const _rem = Storage.prototype.removeItem;
  let silencio = false;                 // true mientras se aplican datos que vienen de la nube
  const temporizadores = new Map();
  const versionLocal = new Map();       // contador de cambios por clave
  const ultimoEnviado = new Map();      // último valor subido (evita subir lo mismo)
  let manejadorIDB = null;              // { leer, escribir } para IndexedDB

  const metaTs = c => 'nube_ts:' + c;
  const metaSucio = c => 'nube_sucio:' + c;
  const esSucio = c => _get.call(localStorage, metaSucio(c)) === '1';

  /* ---------- compresión ---------- */
  async function comprimir(txt) {
    if (typeof CompressionStream === 'undefined') return 'p:' + txt;
    const flujo = new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(flujo).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return 'g:' + btoa(bin);
  }
  async function descomprimir(s) {
    if (s.startsWith('p:')) return s.slice(2);
    const bin = atob(s.slice(2));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const flujo = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(flujo).text();
  }

  /* ---------- lectura/escritura local por clave ---------- */
  async function leerLocal(clave) {
    if (clave === CLAVE_IDB) return manejadorIDB ? await manejadorIDB.leer() : null;
    return _get.call(localStorage, clave);
  }
  async function escribirLocal(clave, texto) {
    silencio = true;
    try {
      if (clave === CLAVE_IDB) { if (manejadorIDB) await manejadorIDB.escribir(texto); }
      else if (texto === null) _rem.call(localStorage, clave);
      else _set.call(localStorage, clave, texto);
    } finally { silencio = false; }
  }

  /* ---------- acceso a la nube ---------- */
  async function http(url, opciones) {
    const r = await fetch(url, opciones);
    if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r;
  }

  async function subir(clave) {
    const ver = versionLocal.get(clave) || 0;
    const texto = await leerLocal(clave);
    if (texto !== null && ultimoEnviado.get(clave) === texto) {      // nada nuevo que subir
      if ((versionLocal.get(clave) || 0) === ver) _rem.call(localStorage, metaSucio(clave));
      return;
    }
    const k = encodeURIComponent(clave);
    let ts;
    if (texto === null) {
      // Borrado: fila 0 vacía con total = 0 y se eliminan las demás partes
      const r = await http(TABLA + '?on_conflict=clave,parte', {
        method: 'POST', headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ clave, parte: 0, valor: null, total: 0 }])
      });
      ts = (await r.json())[0].actualizado_en;
      await http(TABLA + '?clave=eq.' + k + '&parte=gt.0', { method: 'DELETE', headers: HEADERS });
    } else {
      const comp = await comprimir(texto);
      const partes = [];
      for (let i = 0; i < comp.length; i += TAM_PARTE) partes.push(comp.slice(i, i + TAM_PARTE));
      if (!partes.length) partes.push('');
      // Primero las partes 1..n-1 y al final la parte 0 (marca de "completo")
      for (let i = partes.length - 1; i >= 0; i--) {
        const r = await http(TABLA + '?on_conflict=clave,parte', {
          method: 'POST', headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify([{ clave, parte: i, valor: partes[i], total: partes.length }])
        });
        if (i === 0) ts = (await r.json())[0].actualizado_en;
      }
      await http(TABLA + '?clave=eq.' + k + '&parte=gte.' + partes.length, { method: 'DELETE', headers: HEADERS });
      ultimoEnviado.set(clave, texto);
    }
    _set.call(localStorage, metaTs(clave), ts);
    if ((versionLocal.get(clave) || 0) === ver) _rem.call(localStorage, metaSucio(clave));
  }

  async function bajar(clave, fila, senal) {
    if (fila.total === 0) { await escribirLocal(clave, null); return; }
    const k = encodeURIComponent(clave);
    const r = await http(TABLA + '?select=parte,valor&clave=eq.' + k + '&order=parte.asc', { headers: HEADERS, signal: senal });
    const filas = await r.json();
    if (filas.length < fila.total) throw new Error('Datos incompletos en la nube para ' + clave);
    const texto = await descomprimir(filas.map(f => f.valor || '').join(''));
    if (senal && senal.aborted) return;
    await escribirLocal(clave, texto);
    ultimoEnviado.set(clave, texto);
  }

  /* ---------- decidir qué hacer con una clave al abrir ---------- */
  async function sincronizarClave(clave, remoto, senal) {
    const tsLocal = _get.call(localStorage, metaTs(clave));
    if (esSucio(clave)) { await subir(clave); return; }                 // cambios locales pendientes: ganan
    if (!remoto) {                                                      // la nube no tiene nada
      const local = await leerLocal(clave);
      if (local !== null) { _set.call(localStorage, metaSucio(clave), '1'); await subir(clave); }
      return;
    }
    if (tsLocal === remoto.actualizado_en) return;                      // ya está al día
    await bajar(clave, remoto, senal);
    if (!(senal && senal.aborted)) _set.call(localStorage, metaTs(clave), remoto.actualizado_en);
  }

  async function filasRemotas(senal) {
    const r = await http(TABLA + '?select=clave,actualizado_en,total&parte=eq.0', { headers: HEADERS, signal: senal });
    const mapa = new Map();
    (await r.json()).forEach(f => mapa.set(f.clave, f));
    return mapa;
  }

  async function traerTodo(prefijo, senal) {
    const mapa = await filasRemotas(senal);
    for (const clave of CLAVES_LS) {
      if (prefijo && !clave.startsWith(prefijo)) continue;
      try { await sincronizarClave(clave, mapa.get(clave), senal); }
      catch (e) { if (!(senal && senal.aborted)) console.warn('[nube] ' + clave + ':', e.message); }
    }
  }

  /* ---------- detectar cambios locales ---------- */
  function marcar(clave) {
    versionLocal.set(clave, (versionLocal.get(clave) || 0) + 1);
    _set.call(localStorage, metaSucio(clave), '1');
    clearTimeout(temporizadores.get(clave));
    temporizadores.set(clave, setTimeout(() => {
      subir(clave).catch(e => console.warn('[nube] no se pudo subir ' + clave + ':', e.message));
    }, ESPERA_PUSH));
  }

  Storage.prototype.setItem = function (k, v) {
    _set.call(this, k, v);
    if (this === localStorage && !silencio && CLAVES_LS.has(k)) marcar(k);
  };
  Storage.prototype.removeItem = function (k) {
    _rem.call(this, k);
    if (this === localStorage && !silencio && CLAVES_LS.has(k)) marcar(k);
  };

  /* ---------- API pública ---------- */
  const control = new AbortController();
  const inicio = traerTodo(null, control.signal).catch(e => console.warn('[nube] sin conexión:', e.message));
  const limite = new Promise(res => setTimeout(() => { control.abort(); res(); }, TIMEOUT_INICIO));

  window.Nube = {
    // Promesa que se cumple cuando ya se trajo lo último de la nube (o se agotó el tiempo)
    listo: Promise.race([inicio, limite]),

    // IndexedDB (proveedores): leer() -> texto|null ; escribir(texto|null)
    async sincronizarIDB(leer, escribir) {
      manejadorIDB = { leer, escribir };
      try {
        const mapa = await filasRemotas();
        await sincronizarClave(CLAVE_IDB, mapa.get(CLAVE_IDB));
      } catch (e) { console.warn('[nube] proveedores:', e.message); }
    },

    // Avisar que cambió algo guardado fuera de localStorage (proveedores)
    cambio(clave) { marcar(clave || CLAVE_IDB); },

    // Volver a traer lo más reciente (por ejemplo antes de "Cargar Pedido")
    async refrescar(prefijo) {
      try { await traerTodo(prefijo || null); }
      catch (e) { console.warn('[nube] refrescar:', e.message); }
    }
  };
})();

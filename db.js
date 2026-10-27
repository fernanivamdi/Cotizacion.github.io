/* db.js — capa de datos compartida (Supabase REST, sin librerías).
   Reemplaza localStorage / IndexedDB / nube.js en binario, cotizacion y articulos. */
(function () {
  const URL = 'https://xzquhkcdifgqjksjxqaf.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cXVoa2NkaWZncWprc2p4cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NjI2NjgsImV4cCI6MjEwODUzODY2OH0.fsHae5Y9oxttT1LOlSqAYJJNWHwAPmTVc3ToHlxSm1Y';
  const BASE = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  async function req(method, path, body, extra) {
    const r = await fetch(URL + '/rest/v1/' + path, {
      method, headers: { ...BASE, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  async function getAll(path) {            // pagina de 1000 en 1000
    const out = [], size = 1000;
    for (let off = 0; ; off += size) {
      const page = await req('GET', path + '&limit=' + size + '&offset=' + off);
      for (const x of page) out.push(x);
      if (page.length < size) break;
    }
    return out;
  }
  async function chunked(rows, size, fn) {
    for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  }
  const upsert = (tabla, pk, rows) => rows.length
    ? req('POST', tabla + '?on_conflict=' + pk, rows, { Prefer: 'resolution=merge-duplicates,return=minimal' }) : null;
  const num = v => Number(v) || 0;

  /* ---------- ARTÍCULOS ---------- */
  function rowDeItem(i) {
    const se = i.stockEditado || {};
    return {
      codigo: String(i.codigo), articulo: i.articulo || 'Sin descripción', linea: i.linea || 'Sin línea',
      fabricante: i.fabricante || '', fabricante_sucursal: i.fabricanteSucursal || '', marca: i.marca || '',
      ubicacion: i.ubicacion || '',
      almacen: num(i.almacen), matriz: num(i.matriz), sucursal: num(i.sucursal),
      existencia_almacen: num(i.existenciaAlmacen), existencia_matriz: num(i.existenciaMatriz), existencia_sucursal: num(i.existenciaSucursal),
      ventas_matriz: num(i.ventasMatriz), ventas_sucursal: num(i.ventasSucursal),
      stock_editado_almacen: num(se.almacen), stock_editado_matriz: num(se.matriz), stock_editado_sucursal: num(se.sucursal),
      no_disponible_matriz: !!i.noDisponibleMatriz, no_disponible_sucursal: !!i.noDisponibleSucursal,
      pedido_matriz_ok: typeof i.pedidoMatrizOk === 'number' ? i.pedidoMatrizOk : null,
      pedido_sucursal_ok: typeof i.pedidoSucursalOk === 'number' ? i.pedidoSucursalOk : null
    };
  }
  function itemDeRow(r) {
    const it = {
      codigo: r.codigo, articulo: r.articulo, linea: r.linea, fabricante: r.fabricante,
      fabricanteSucursal: r.fabricante_sucursal, marca: r.marca, ubicacion: r.ubicacion,
      almacen: num(r.almacen), matriz: num(r.matriz), sucursal: num(r.sucursal),
      existenciaAlmacen: num(r.existencia_almacen), existenciaMatriz: num(r.existencia_matriz), existenciaSucursal: num(r.existencia_sucursal),
      ventasMatriz: num(r.ventas_matriz), ventasSucursal: num(r.ventas_sucursal),
      stockEditado: { almacen: num(r.stock_editado_almacen), matriz: num(r.stock_editado_matriz), sucursal: num(r.stock_editado_sucursal) },
      noDisponibleMatriz: !!r.no_disponible_matriz, noDisponibleSucursal: !!r.no_disponible_sucursal,
      _cache: null
    };
    if (r.pedido_matriz_ok !== null) it.pedidoMatrizOk = num(r.pedido_matriz_ok);
    if (r.pedido_sucursal_ok !== null) it.pedidoSucursalOk = num(r.pedido_sucursal_ok);
    it.totalStock = it.almacen + it.matriz + it.sucursal;
    it.totalVentas = it.ventasMatriz + it.ventasSucursal;
    return it;
  }
  const articulos = {
    rowDeItem,
    async cargar() { return (await getAll('articulos?select=*&order=codigo')).map(itemDeRow); },
    // Solo artículos con pedido > 0 (o sin calcular) + stock por línea, para cotizacion
    async paraPedidos() {
      const f = 'or=(pedido_matriz_ok.gt.0,pedido_sucursal_ok.gt.0,pedido_matriz_ok.is.null,pedido_sucursal_ok.is.null)';
      const [rows, sl] = await Promise.all([getAll('articulos?select=*&' + f + '&order=codigo'), stockLinea.cargar()]);
      return { items: rows.map(itemDeRow), stockLinea: sl };
    },
    guardar: rows => chunked(rows, 1000, c => upsert('articulos', 'codigo', c)),
    borrar: codigos => chunked(codigos, 100, c =>
      req('DELETE', 'articulos?codigo=in.(' + c.map(x => '"' + String(x).replace(/"/g, '\\"') + '"').join(',') + ')', undefined, { Prefer: 'return=minimal' }))
  };

  /* ---------- STOCK POR LÍNEA ---------- */
  const stockLinea = {
    async cargar() {
      const m = {};
      (await getAll('stock_linea?select=*&order=linea')).forEach(r => { m[r.linea] = { almacen: num(r.almacen), matriz: num(r.matriz), sucursal: num(r.sucursal) }; });
      return m;
    },
    guardar: rows => upsert('stock_linea', 'linea', rows)
  };

  /* ---------- CONFIGURACIÓN ---------- */
  const config = {
    async get(clave) {
      const r = await req('GET', 'configuracion?select=valor&clave=eq.' + encodeURIComponent(clave));
      return r && r[0] ? r[0].valor : null;
    },
    set: (clave, valor) => upsert('configuracion', 'clave', [{ clave, valor }])
  };

  /* ---------- PROVEEDORES ---------- */
  let provConocidos = new Set();
  const metaProv = (p, i) => ({
    nombre: p.nombre, stock_minimo: num(p.stockMinimo), activar_stock: !!p.activarStock, descuento: num(p.descuento), orden: i,
    archivo_nombre: p.archivo?.nombre ?? null, archivo_tamano: p.archivo?.tamano ?? null, archivo_hoja: p.archivo?.hoja ?? null,
    archivo_modo: p.archivo?.modo ?? null, archivo_columnas: p.archivo?.columnas ?? null, archivo_fecha: p.archivo?.fecha ?? null
  });
  const proveedores = {
    async cargar() {
      const rows = await req('GET', 'proveedores?select=*&order=orden,created_at');
      const lista = rows.map(r => ({
        _id: r.id, nombre: r.nombre, stockMinimo: r.stock_minimo, activarStock: r.activar_stock, descuento: num(r.descuento),
        archivo: r.archivo_nombre ? { nombre: r.archivo_nombre, tamano: r.archivo_tamano, hoja: r.archivo_hoja, modo: r.archivo_modo, columnas: r.archivo_columnas, fecha: r.archivo_fecha } : null,
        productos: []
      }));
      let k = 0;                              // 3 descargas en paralelo
      await Promise.all([0, 1, 2].map(async () => {
        while (k < lista.length) {
          const p = lista[k++];
          p.productos = await req('POST', 'rpc/productos_de_proveedor', { p_id: p._id });
        }
      }));
      provConocidos = new Set(lista.map(p => p._id));
      return lista;
    },
    // Sincroniza: crea los nuevos (con productos), actualiza metadatos/orden, borra los quitados
    async guardar(lista) {
      const actuales = new Set(lista.filter(p => p._id).map(p => p._id));
      const borrar = [...provConocidos].filter(id => !actuales.has(id));
      if (borrar.length) await req('DELETE', 'proveedores?id=in.(' + borrar.join(',') + ')', undefined, { Prefer: 'return=minimal' });
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        if (!p._id) {
          const id = crypto.randomUUID();
          try {
            await req('POST', 'proveedores', { id, ...metaProv(p, i) }, { Prefer: 'return=minimal' });
            const filas = (p.productos || []).map(x => ({
              proveedor_id: id, codigo: String(x.codigo), descripcion: x.descripcion || '',
              existencia: num(x.existencia), precio: num(x.precio), precio_original: x.precioOriginal ?? null
            }));
            await chunked(filas, 2000, c => req('POST', 'proveedor_productos', c, { Prefer: 'return=minimal' }));
            p._id = id;
          } catch (e) {                       // si falla a medias, no dejar proveedor incompleto
            await req('DELETE', 'proveedores?id=eq.' + id, undefined, { Prefer: 'return=minimal' }).catch(() => {});
            throw e;
          }
        } else {
          await req('PATCH', 'proveedores?id=eq.' + p._id, metaProv(p, i), { Prefer: 'return=minimal' });
        }
      }
      provConocidos = new Set(lista.map(p => p._id));
    }
  };

  /* ---------- PEDIDOS ---------- */
  let colaPedidos = Promise.resolve();
  const limpio = (k, v) => (k[0] === '_' || typeof v === 'function') ? undefined : v;
  const pedidos = {
    async cargar(tipo) {
      const rows = await getAll('pedidos?select=*&tipo=eq.' + tipo + '&order=id');
      return rows.map(r => ({
        codigo: r.codigo, descripcion: r.descripcion, piezas: num(r.piezas), linea: r.linea, marca: r.marca,
        fabricante: r.fabricante, fabricanteSucursal: r.fabricante_sucursal, esManual: r.es_manual,
        existenciaAlmacen: num(r.existencia_almacen), existenciaMatriz: num(r.existencia_matriz), existenciaSucursal: num(r.existencia_sucursal),
        ...(r.proveedor_seleccionado ? { proveedorSeleccionado: r.proveedor_seleccionado } : {}),
        ...(r.extra || {})
      }));
    },
    guardar(tipo, items) {
      const rows = items.map(p => ({
        codigo: String(p.codigo), descripcion: p.descripcion || '', piezas: num(p.piezas), linea: p.linea || '', marca: p.marca || '',
        fabricante: p.fabricante || '', fabricante_sucursal: p.fabricanteSucursal || '', es_manual: !!p.esManual,
        proveedor_seleccionado: p.proveedorSeleccionado || null,
        existencia_almacen: num(p.existenciaAlmacen), existencia_matriz: num(p.existenciaMatriz), existencia_sucursal: num(p.existenciaSucursal),
        extra: JSON.parse(JSON.stringify(p, limpio))
      }));
      colaPedidos = colaPedidos.catch(() => {}).then(() => req('POST', 'rpc/reemplazar_pedidos', { p_tipo: tipo, p_rows: rows }));
      return colaPedidos;
    },
    limpiar() { return Promise.all([this.guardar('matriz', []), this.guardar('sucursal', [])]); }
  };

  window.DB = { articulos, stockLinea, config, proveedores, pedidos, req };
})();

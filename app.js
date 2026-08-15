// ========== AUTENTICACIÓN ==========
const USERS = {
    "ADMIN": { password: "1234", role: "admin" },
    "ADN":   { password: "1234", role: "user" }
};

function login(username, password, remember) {
    let upper = username.toUpperCase();
    let user = USERS[upper];
    if (user && user.password === password) {
        sessionStorage.setItem('currentUser', JSON.stringify({ username: upper, role: user.role }));
        if (remember) {
            localStorage.setItem('rememberedUser', upper);
            localStorage.setItem('rememberedPass', password);
        } else {
            localStorage.removeItem('rememberedUser');
            localStorage.removeItem('rememberedPass');
        }
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function checkAuth() {
    const session = sessionStorage.getItem('currentUser');
    if (!session) {
        window.location.href = 'index.html';
        return;
    }
    const user = JSON.parse(session);
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) userDisplay.textContent = `${user.username} (${user.role})`;
    const welcome = document.getElementById('welcomeMsg');
    if (welcome) welcome.textContent = `Bienvenido, ${user.username} (${user.role})`;
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// ========== GESTIÓN DE DATOS ==========
const STORAGE_KEY = 'cotizador_pro_data';
let proveedores = [];
let productosMaestro = [];

function cargarDatos() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            proveedores = parsed.proveedores || [];
            productosMaestro = parsed.productosMaestro || [];
            return true;
        }
    } catch (e) { console.warn('Error cargando datos:', e); }
    return false;
}

function guardarDatos() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            proveedores: proveedores.map(p => ({...p, productos: p.productos.map(prod => ({...prod}))})),
            productosMaestro: [...productosMaestro]
        }));
    } catch (e) { console.warn('Error guardando datos:', e); }
}

// ========== TOAST ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'check_circle', warning: 'warning', danger: 'error', info: 'info' };
    toast.innerHTML = `<span class="material-icons" style="font-size:20px;">${icons[type]}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== TEMA Y SIDEBAR (GLOBALES) ==========
function initThemeAndSidebar() {
    // Tema oscuro
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = `<span class="material-icons" style="font-size:18px;">light_mode</span>`;
    }
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark 
            ? `<span class="material-icons" style="font-size:18px;">light_mode</span>` 
            : `<span class="material-icons" style="font-size:18px;">dark_mode</span>`;
    });

    // Sidebar colapsado por defecto
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const toggleBtn = document.getElementById('sidebarToggle');
    // Inicialmente ya tiene clase "collapsed" y "expanded" en main
    // Pero al hacer clic, alternamos
    toggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded', isCollapsed);
        toggleBtn.querySelector('.material-icons').textContent = isCollapsed ? 'chevron_right' : 'chevron_left';
        // Guardar preferencia en localStorage
        localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
    });

    // Restaurar estado del sidebar desde localStorage (opcional)
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('expanded');
        toggleBtn.querySelector('.material-icons').textContent = 'chevron_right';
    } else if (savedState === 'false') {
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('expanded');
        toggleBtn.querySelector('.material-icons').textContent = 'chevron_left';
    }
}

// ========== FUNCIONES COMUNES DE UI ==========
// Modal global
window.abrirModal = function(codigo, descripcion) {
    const modal = document.getElementById('modalDetalle');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    const opciones = [];
    proveedores.forEach(prov => {
        const producto = prov.productos.find(p => p.codigo === codigo);
        if (producto) {
            opciones.push({
                proveedor: prov.nombre,
                existencia: producto.existencia,
                precio: producto.precio
            });
        }
    });
    opciones.sort((a, b) => a.precio - b.precio);

    let html = `
        <div style="margin-bottom:20px;">
            <h3 style="color:var(--text-color);font-size:1.2rem;">${codigo}</h3>
            <p style="color:var(--gray-500);">${descripcion}</p>
        </div>
        <div style="margin-bottom:16px;"><strong>Proveedores disponibles: ${opciones.length}</strong></div>
    `;
    if (opciones.length === 0) {
        html += `<div class="alert alert-warning"><span class="material-icons">warning</span><div><strong>FDC - Fuera de Catálogo</strong><br>Este producto no está disponible en ningún proveedor.</div></div>`;
    } else {
        opciones.forEach((op, index) => {
            let rankClass = '', rankBadge = '', cardClass = '';
            if (index === 0) { rankClass = 'rank-1'; rankBadge = 'Mejor precio'; cardClass = 'mejor'; }
            else if (index === 1) { rankClass = 'rank-2'; rankBadge = '2da opción'; cardClass = 'segundo'; }
            else if (index === 2) { rankClass = 'rank-3'; rankBadge = '3ra opción'; }
            else { rankClass = 'rank-other'; rankBadge = `#${index + 1}`; }
            html += `
                <div class="proveedor-card ${cardClass}">
                    <div class="proveedor-card-header">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span class="rank-badge ${rankClass}">${rankBadge}</span>
                            <strong style="font-size:1.1rem;">${op.proveedor}</strong>
                        </div>
                    </div>
                    <div class="proveedor-card-details">
                        <div class="detail-item">
                            <label>Precio Unitario</label>
                            <span style="color:var(--success);">$${op.precio.toFixed(2)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Existencia</label>
                            <span>${op.existencia} unidades</span>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    content.innerHTML = html;
    modal.classList.add('show');
};

window.cerrarModal = function() {
    const modal = document.getElementById('modalDetalle');
    if (modal) modal.classList.remove('show');
};

document.addEventListener('click', function(e) {
    const modal = document.getElementById('modalDetalle');
    if (modal && e.target === modal) cerrarModal();
});

// ========== PÁGINA PROVEEDORES ==========
function initProveedoresPage() {
    cargarDatos();
    actualizarListaProveedores();

    document.getElementById('activarStockMinimo').addEventListener('change', function() {
        document.getElementById('stockMinimo').disabled = !this.checked;
        if (!this.checked) document.getElementById('stockMinimo').value = '20';
    });
    document.getElementById('aplicarDescuento').addEventListener('change', function() {
        document.getElementById('porcentajeDescuento').disabled = !this.checked;
        if (!this.checked) document.getElementById('porcentajeDescuento').value = '0';
    });

    document.getElementById('btnAgregarProveedor').addEventListener('click', () => {
        const nombre = document.getElementById('nombreProveedor').value.trim();
        const fileInput = document.getElementById('archivoProveedor');
        const activarStock = document.getElementById('activarStockMinimo').checked;
        const stockMinimo = activarStock ? (parseInt(document.getElementById('stockMinimo').value) || 20) : 0;
        const aplicarDescuento = document.getElementById('aplicarDescuento').checked;
        const porcentajeDescuento = aplicarDescuento ? (parseFloat(document.getElementById('porcentajeDescuento').value) || 0) : 0;

        if (!nombre) { showToast('Ingrese el nombre del proveedor', 'warning'); return; }
        if (!fileInput.files[0]) { showToast('Seleccione un archivo Excel', 'warning'); return; }
        if (proveedores.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
            showToast('Ya existe un proveedor con este nombre', 'warning'); return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                if (json.length < 2) { showToast('El archivo Excel está vacío', 'warning'); return; }

                let productos = json.slice(1).map(row => ({
                    codigo: String(row[0] || '').trim(),
                    descripcion: String(row[1] || '').trim(),
                    existencia: parseFloat(row[2]) || 0,
                    precio: parseFloat(row[3]) || 0
                })).filter(p => p.codigo && p.precio > 0);

                if (aplicarDescuento && porcentajeDescuento > 0) {
                    productos = productos.map(p => ({...p, precioOriginal: p.precio, precio: p.precio * (1 - porcentajeDescuento / 100)}));
                }
                if (productos.length === 0) { showToast('No se encontraron productos válidos', 'warning'); return; }

                proveedores.push({ nombre, productos, stockMinimo, descuento: aplicarDescuento ? porcentajeDescuento : 0, activarStock });
                actualizarListaProveedores();
                guardarDatos();

                document.getElementById('nombreProveedor').value = '';
                document.getElementById('archivoProveedor').value = '';
                document.getElementById('activarStockMinimo').checked = false;
                document.getElementById('stockMinimo').value = '20';
                document.getElementById('stockMinimo').disabled = true;
                document.getElementById('aplicarDescuento').checked = false;
                document.getElementById('porcentajeDescuento').value = '0';
                document.getElementById('porcentajeDescuento').disabled = true;

                showToast(`Proveedor "${nombre}" cargado (${productos.length} productos)`, 'success');
            } catch (error) {
                showToast('Error al procesar el archivo Excel', 'danger');
                console.error(error);
            }
        };
        reader.readAsArrayBuffer(fileInput.files[0]);
    });
}

function actualizarListaProveedores() {
    const div = document.getElementById('listaProveedores');
    if (!div) return;
    if (proveedores.length === 0) {
        div.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:20px;">No hay proveedores cargados</p>';
        return;
    }
    div.innerHTML = proveedores.map((p, index) => `
        <div class="proveedor-item">
            <div class="proveedor-info">
                <span class="material-icons" style="color:var(--primary);">store</span>
                <div>
                    <div class="proveedor-name">${p.nombre}</div>
                    <div class="product-count">${p.productos.length} productos | Stock mín: ${p.activarStock ? p.stockMinimo : 'No'} | Desc: ${p.descuento}%</div>
                </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="eliminarProveedor(${index})">
                <span class="material-icons">delete</span>
            </button>
        </div>
    `).join('');
}

window.eliminarProveedor = function(index) {
    proveedores.splice(index, 1);
    actualizarListaProveedores();
    guardarDatos();
    const filtro = document.getElementById('filtroProveedor');
    if (filtro) actualizarFiltroProveedores();
};

function actualizarFiltroProveedores() {
    const select = document.getElementById('filtroProveedor');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="todos">Todos los proveedores</option>';
    proveedores.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nombre;
        opt.textContent = p.nombre;
        select.appendChild(opt);
    });
    select.value = currentVal;
    if (typeof generarTablaComparativa === 'function') {
        select.onchange = () => generarTablaComparativa();
        select.dispatchEvent(new Event('change'));
    }
}

// ========== PÁGINA CARGAR PEDIDOS ==========
function initCargarPedidosPage() {
    cargarDatos();
    document.getElementById('btnCargarMaestro').addEventListener('click', () => {
        const file = document.getElementById('archivoMaestro').files[0];
        if (!file) { showToast('Seleccione un archivo Excel', 'warning'); return; }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                if (json.length < 2) { showToast('El archivo Excel está vacío', 'warning'); return; }

                productosMaestro = json.slice(1).map(row => ({
                    codigo: String(row[0] || '').trim(),
                    descripcion: String(row[1] || '').trim(),
                    piezas: parseFloat(row[2]) || 1
                })).filter(p => p.codigo);
                if (productosMaestro.length === 0) { showToast('No se encontraron productos válidos', 'warning'); return; }

                document.getElementById('estadoMaestro').innerHTML = `
                    <div class="alert alert-info">
                        <span class="material-icons">check_circle</span>
                        <div><strong>✅ Lista maestra cargada exitosamente</strong><br>${productosMaestro.length} productos encontrados</div>
                    </div>
                `;
                guardarDatos();
                showToast(`Lista maestra cargada (${productosMaestro.length} productos)`, 'success');
            } catch (error) {
                showToast('Error al procesar el archivo Excel', 'danger');
                console.error(error);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ========== PÁGINA COMPARATIVO ==========
function initComparativoPage() {
    cargarDatos();
    actualizarFiltroProveedores();
    generarTablaComparativa();

    const searchInput = document.getElementById('searchProducto');
    const searchResults = document.getElementById('searchResults');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.trim().toLowerCase();
            if (query.length < 2) { searchResults.classList.remove('show'); return; }
            const resultados = [];
            const seen = new Set();
            proveedores.forEach(prov => {
                prov.productos.forEach(prod => {
                    const key = prod.codigo.toLowerCase();
                    if (!seen.has(key) && (prod.codigo.toLowerCase().includes(query) || prod.descripcion.toLowerCase().includes(query))) {
                        seen.add(key);
                        const enListaMaestra = productosMaestro.some(p => p.codigo === prod.codigo);
                        resultados.push({...prod, proveedor: prov.nombre, enListaMaestra});
                    }
                });
            });
            const resultadosLimitados = resultados.slice(0, 10);
            if (resultadosLimitados.length === 0) {
                searchResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--gray-400);">No se encontraron productos</div>';
            } else {
                searchResults.innerHTML = resultadosLimitados.map(r => `
                    <div class="search-result-item">
                        <div>
                            <strong>${r.codigo}</strong> - ${r.descripcion}<br>
                            <small style="color:var(--gray-500);">${r.proveedor} | $${r.precio.toFixed(2)} | Existencia: ${r.existencia}</small>
                            ${r.enListaMaestra ? '<br><span class="badge badge-success" style="margin-top:4px;">✅ En pedido actual</span>' : ''}
                        </div>
                        <div class="result-actions">
                            <button class="btn btn-info btn-xs" onclick="abrirModal('${r.codigo}', '${r.descripcion.replace(/'/g, "\\'")}')" title="Ver detalle">
                                <span class="material-icons" style="font-size:16px;">visibility</span> Detalle
                            </button>
                            ${!r.enListaMaestra ? 
                                `<button class="btn btn-primary btn-xs" onclick="agregarAlPedido('${r.codigo}', '${r.descripcion.replace(/'/g, "\\'")}', event)">
                                    <span class="material-icons" style="font-size:16px;">add_shopping_cart</span> Agregar
                                </button>` : ''}
                        </div>
                    </div>
                `).join('');
            }
            searchResults.classList.add('show');
        });

        document.addEventListener('click', function(e) {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('show');
            }
        });
    }

    document.getElementById('btnGenerarFiltrado').addEventListener('click', () => {
        const prov = document.getElementById('filtroProveedor').value;
        if (prov === 'todos') { showToast('Seleccione un proveedor específico en el filtro', 'warning'); return; }
        generarPDFPorProveedor(prov);
    });

    document.getElementById('btnGenerarTodos').addEventListener('click', () => {
        if (proveedores.length === 0) { showToast('No hay proveedores cargados', 'warning'); return; }
        proveedores.forEach(p => generarPDFPorProveedor(p.nombre));
        setTimeout(() => showToast(`Se generaron ${proveedores.length} archivos PDF`, 'success'), 500);
    });
}

// ========== TABLA COMPARATIVA ==========
function generarTablaComparativa() {
    const tbody = document.getElementById('cuerpoTabla');
    const filtroProveedor = document.getElementById('filtroProveedor')?.value || 'todos';
    if (!tbody) return;

    if (proveedores.length === 0 || productosMaestro.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--gray-400);">Cargue proveedores y lista maestra para ver el comparativo</td></tr>';
        actualizarTotalGeneral();
        return;
    }

    tbody.innerHTML = '';

    productosMaestro.forEach((prod) => {
        const proveedoresValidos = [];
        proveedores.forEach(prov => {
            const encontrado = prov.productos.find(p => p.codigo === prod.codigo);
            if (encontrado && encontrado.existencia > 0) {
                proveedoresValidos.push({
                    proveedor: prov.nombre,
                    ...encontrado,
                    stockMinimo: prov.stockMinimo,
                    activarStock: prov.activarStock
                });
            }
        });

        proveedoresValidos.sort((a, b) => a.precio - b.precio);
        const proveedorAsignado = proveedoresValidos.length > 0 ? proveedoresValidos[0] : null;
        const segundaOpcion = proveedoresValidos.length > 1 ? proveedoresValidos[1] : null;

        if (filtroProveedor !== 'todos') {
            if (!proveedorAsignado || proveedorAsignado.proveedor !== filtroProveedor) return;
        }

        const row = document.createElement('tr');
        if (!proveedorAsignado && filtroProveedor === 'todos') {
            row.innerHTML = `
                <td><strong>${prod.codigo}</strong></td>
                <td>${prod.descripcion}</td>
                <td><input type="number" class="piezas-input" value="${prod.piezas}" min="1" style="width:70px;"></td>
                <td><span class="badge badge-fdc">FDC</span></td>
                <td>-</td>
                <td>-</td>
                <td><span class="text-muted">Fuera de catálogo</span></td>
                <td><span class="text-muted">N/A</span></td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-info btn-xs" onclick="abrirModal('${prod.codigo}', '${prod.descripcion.replace(/'/g, "\\'")}')" title="Ver detalle">
                            <span class="material-icons" style="font-size:16px;">visibility</span>
                        </button>
                        <button class="btn btn-danger btn-xs" onclick="eliminarProductoMaestro('${prod.codigo}')" title="Eliminar">
                            <span class="material-icons" style="font-size:16px;">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
            return;
        }

        if (proveedorAsignado) {
            const subtotal = proveedorAsignado.precio * prod.piezas;
            let existenciaHTML = `<span class="badge badge-success">${proveedorAsignado.existencia}</span>`;
            let stockWarningHTML = '';
            if (proveedorAsignado.activarStock && proveedorAsignado.existencia < proveedorAsignado.stockMinimo) {
                stockWarningHTML = `
                    <span class="material-icons warning-icon" style="font-size:16px;margin-left:4px;" title="Existencia baja">warning</span>
                    <div class="stock-bajo-alert">Existencia baja</div>
                `;
            }
            let segundaOpcionHTML = segundaOpcion 
                ? `<span class="badge badge-info">${segundaOpcion.proveedor} - $${segundaOpcion.precio.toFixed(2)}</span>` 
                : '<span class="text-muted">No disponible</span>';

            row.innerHTML = `
                <td><strong>${prod.codigo}</strong></td>
                <td>${prod.descripcion}</td>
                <td><input type="number" class="piezas-input" value="${prod.piezas}" min="1" style="width:70px;"></td>
                <td>${existenciaHTML}${stockWarningHTML}</td>
                <td>$${proveedorAsignado.precio.toFixed(2)}</td>
                <td class="text-highlight">$${subtotal.toFixed(2)}</td>
                <td><span style="font-weight:500;">${proveedorAsignado.proveedor}</span></td>
                <td>${segundaOpcionHTML}</td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-info btn-xs" onclick="abrirModal('${prod.codigo}', '${prod.descripcion.replace(/'/g, "\\'")}')" title="Ver detalle">
                            <span class="material-icons" style="font-size:16px;">visibility</span>
                        </button>
                        <button class="btn btn-danger btn-xs" onclick="eliminarProductoMaestro('${prod.codigo}')" title="Eliminar">
                            <span class="material-icons" style="font-size:16px;">delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        }
    });

    document.querySelectorAll('.piezas-input').forEach(input => {
        input.addEventListener('input', function() { actualizarPiezas(this); });
    });
    actualizarTotalGeneral();
}

function actualizarPiezas(inputElement) {
    const row = inputElement.closest('tr');
    const precioText = row.cells[4].textContent;
    if (precioText === '-') return;
    const precio = parseFloat(precioText.replace('$', '')) || 0;
    const piezas = parseInt(inputElement.value) || 0;
    const subtotal = precio * piezas;
    row.cells[5].innerHTML = `<span class="text-highlight">$${subtotal.toFixed(2)}</span>`;
    const codigo = row.cells[0].textContent.trim();
    const prodMaestro = productosMaestro.find(p => p.codigo === codigo);
    if (prodMaestro) {
        prodMaestro.piezas = piezas;
        guardarDatos();
    }
    actualizarTotalGeneral();
}

function actualizarTotalGeneral() {
    const totalEl = document.getElementById('totalGeneral');
    if (!totalEl) return;
    let total = 0;
    document.querySelectorAll('#cuerpoTabla tr').forEach(row => {
        const subtotalCell = row.cells[5];
        if (subtotalCell && subtotalCell.textContent !== '-') {
            const subtotal = parseFloat(subtotalCell.textContent.replace('$', '')) || 0;
            total += subtotal;
        }
    });
    totalEl.textContent = `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

window.eliminarProductoMaestro = function(codigo) {
    productosMaestro = productosMaestro.filter(p => p.codigo !== codigo);
    guardarDatos();
    generarTablaComparativa();
    showToast(`Producto ${codigo} eliminado del pedido`, 'warning');
};

window.agregarAlPedido = function(codigo, descripcion, event) {
    if (event) event.stopPropagation();
    if (productosMaestro.some(p => p.codigo === codigo)) {
        showToast('Este producto ya está en el pedido', 'warning');
        return;
    }
    productosMaestro.unshift({codigo, descripcion, piezas: 1});
    showToast(`Producto ${codigo} agregado al pedido`, 'success');
    guardarDatos();
    generarTablaComparativa();
    setTimeout(() => {
        const primeraFila = document.querySelector('#cuerpoTabla tr:first-child');
        if (primeraFila) {
            primeraFila.classList.add('new-row');
            setTimeout(() => primeraFila.classList.remove('new-row'), 2000);
        }
    }, 100);
    const searchInput = document.getElementById('searchProducto');
    const searchResults = document.getElementById('searchResults');
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.classList.remove('show');
};

// ========== GENERAR PDF ==========
function generarPDFPorProveedor(nombreProveedor) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('PEDIDO DE COMPRA', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Proveedor: ${nombreProveedor}`, 105, 30, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 14, 50);

    const filas = Array.from(document.querySelectorAll('#cuerpoTabla tr'))
        .filter(row => {
            const proveedorCell = row.cells[6];
            return proveedorCell && proveedorCell.textContent.trim() === nombreProveedor;
        });

    if (filas.length === 0) {
        doc.text('No hay productos para este proveedor', 14, 60);
        doc.save(`Pedido_${nombreProveedor.replace(/\s+/g, '_')}.pdf`);
        return;
    }

    const datos = filas.map(row => [
        row.cells[0].textContent,
        row.cells[1].textContent,
        row.querySelector('.piezas-input')?.value || row.cells[2].textContent,
        row.cells[4].textContent,
        row.cells[5].textContent
    ]);

    const totalProveedor = filas.reduce((sum, row) => {
        const subtotal = parseFloat(row.cells[5].textContent.replace('$', '')) || 0;
        return sum + subtotal;
    }, 0);

    doc.autoTable({
        head: [['Código', 'Descripción', 'Piezas', 'Precio Unit.', 'Subtotal']],
        body: datos,
        startY: 60,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        foot: [['', '', '', 'TOTAL:', `$${totalProveedor.toFixed(2)}`]],
        footStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold' }
    });

    doc.save(`Pedido_${nombreProveedor.replace(/\s+/g, '_')}.pdf`);
}
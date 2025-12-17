// ----------------------
// VARIABLES GLOBALES
// ----------------------
let plataformaActual = "twitch";
let asistenciaBD = [];
let asistenciaFiltrada = [];
let autoRefreshEnabled = false;

// ----------------------
// UTILIDAD PARA ESCAPAR HTML
// ----------------------
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function(m) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
}

// ----------------------
// CAMBIO DE PLATAFORMA
// ----------------------
function seleccionarPlataforma(plataforma) {
    plataformaActual = plataforma;

    document.querySelectorAll(".platform-btn").forEach(btn =>
        btn.classList.remove("selected")
    );

    document.querySelector(`.platform-btn[data-platform="${plataforma}"]`)
        ?.classList.add("selected");

    renderizarTabla();
}

window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".platform-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            seleccionarPlataforma(btn.dataset.platform);
        });
    });
});

// ----------------------
// CARGAR ASISTENCIAS
// ----------------------
async function cargarAsistenciasBD() {
    if (!window.pywebview?.api) return;

    try {
        const res = await window.pywebview.api.get_asistencias();

        if (res?.success && Array.isArray(res.data)) {
            asistenciaBD = res.data;
            renderizarTabla();
        }
    } catch (err) {
        console.error("Error cargando asistencias", err);
    }
}

// ----------------------
// RENDERIZAR TABLA
// ----------------------
function renderizarTabla() {
    const tbody = document.getElementById("tablaAsistencias");
    if (!tbody) return;

    tbody.innerHTML = "";

    asistenciaFiltrada = asistenciaBD.filter(
        item => item.platform === plataformaActual
    );

    const filtro = document.getElementById("buscador").value.toLowerCase();
    let lista = asistenciaFiltrada;

    if (filtro) {
        lista = lista.filter(item =>
            item.nickname.toLowerCase().includes(filtro)
        );
    }

    const orden = document.getElementById("ordenar").value;

    if (orden === "nombre") {
        lista.sort((a, b) => a.nickname.localeCompare(b.nickname));
    } else {
        lista.sort((a, b) => b.total_asistencias - a.total_asistencias);
    }

    if (lista.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">
                No hay registros para ${plataformaActual}
            </td></tr>`;
        return;
    }

    lista.forEach(item => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-[#2a2a2b] hover:bg-[#1f1f20] transition-colors";

        // Aquí usamos clases de Tailwind para que coincida con tu diseño actual
        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-200">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-xs text-gray-400 font-bold">
                        ${item.nickname.charAt(0).toUpperCase()}
                    </div>
                    ${escapeHtml(item.nickname)}
                </div>
            </td>
            <td class="px-4 py-3 font-mono text-lg font-bold text-gray-100">
                ${item.total_asistencias}
            </td>
            <td class="px-4 py-3">
                <div class="flex gap-2">
                    <button onclick="editarAsistencia(${item.id}, '${item.nickname}')" 
                            class="p-2 rounded hover:bg-blue-900/30 text-blue-400 border border-transparent hover:border-blue-500/50 transition-all" 
                            title="Editar">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="eliminarAsistencia(${item.id})" 
                            class="p-2 rounded hover:bg-red-900/30 text-red-400 border border-transparent hover:border-red-500/50 transition-all" 
                            title="Eliminar">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// ----------------------
// EDITAR
// ----------------------
async function editarAsistencia(id, nickname) {
    const nuevo = prompt(`Editar asistencias de ${nickname}:`);
    if (nuevo === null) return;

    const num = parseInt(nuevo);
    if (isNaN(num) || num < 0) return alert("Valor inválido");

    const res = await window.pywebview.api.editar_asistencia(id, num);

    if (res.success) {
        cargarAsistenciasBD();
    } else {
        alert("Error: " + res.error);
    }
}

// ----------------------
// ELIMINAR
// ----------------------
async function eliminarAsistencia(id) {
    if (!confirm("¿Eliminar registro?")) return;

    const res = await window.pywebview.api.delete_asistencia(id);

    if (res.success) {
        cargarAsistenciasBD();
    } else {
        alert("Error: " + res.error);
    }
}

// ----------------------
// AUTO-REFRESH INTELIGENTE
// ----------------------
function activarAutoRefresh() {
    if (autoRefreshEnabled) return;
    autoRefreshEnabled = true;

    if (window.pywebview?.on) {
        window.pywebview.on("asistencias:updated", () => {
            cargarAsistenciasBD();
        });
        return;
    }

    // Fallback
    setInterval(() => {
        cargarAsistenciasBD();
    }, 2000);
}

// ----------------------
// EVENTO: pywebview listo
// ----------------------
window.addEventListener("pywebviewready", () => {
    cargarAsistenciasBD();
    activarAutoRefresh();
});

// Buscador y orden
window.addEventListener("DOMContentLoaded", () => {
    const buscador = document.getElementById("buscador");
    const orden = document.getElementById("ordenar");
    
    if(buscador) buscador.addEventListener("input", renderizarTabla);
    if(orden) orden.addEventListener("change", renderizarTabla);
});

// ==========================================
// ⚙️ LÓGICA DEL MODAL DE CONFIGURACIÓN
// ==========================================

function openAsistenciaModal() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_asistencia_config().then(response => {
            if (response.success) {
                const config = response.data;
                
                document.getElementById('cmdAsistenciaName').value = config.command || "!asistencia";
                // alias eliminado...
                document.getElementById('cmdCooldown').value = config.cooldown || 0;
                
                // --- BORRA LA LÍNEA DEL RESET MODE ---
                // document.getElementById('cmdResetMode').value = config.reset_mode || "stream"; 
                
                document.getElementById('cmdSoundEnabled').checked = config.sound_enabled || false;
                document.getElementById('cmdSoundFile').value = config.sound_file || "";
                document.getElementById('msgSuccess').value = config.msg_success || "{user}, asistencia registrada ✔️";
                document.getElementById('msgError').value = config.msg_error || "{user}, ya registraste tu asistencia hoy ❌";

                toggleSoundInput();
            }
        });
    }
    
    const modal = document.getElementById('asistenciaModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeAsistenciaModal() {
    const modal = document.getElementById('asistenciaModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 200);
}

function toggleSoundInput() {
    const enabled = document.getElementById('cmdSoundEnabled').checked;
    const container = document.getElementById('soundConfigContainer');
    // Si no existe el contenedor en el HTML todavía (porque no lo has pegado), evitamos error
    if(container) {
        container.style.display = enabled ? 'flex' : 'none';
    }
}

async function seleccionarSonido() {
    if (window.pywebview && window.pywebview.api) {
        const path = await window.pywebview.api.select_audio_file();
        if (path) {
            document.getElementById('cmdSoundFile').value = path;
        }
    }
}

async function guardarConfigAsistencia(event) {
    event.preventDefault();

    const config = {
        command: document.getElementById('cmdAsistenciaName').value.trim(),
        cooldown: parseInt(document.getElementById('cmdCooldown').value) || 0,
        reset_mode: "stream", 
        sound_enabled: document.getElementById('cmdSoundEnabled').checked,
        sound_file: document.getElementById('cmdSoundFile') ? document.getElementById('cmdSoundFile').value : "",
        msg_success: document.getElementById('msgSuccess').value.trim(),
        msg_error: document.getElementById('msgError').value.trim()
    };

    if (!config.command.startsWith('!')) {
        alert("El comando debe empezar con '!'");
        return;
    }

    if (window.pywebview && window.pywebview.api) {
        const res = await window.pywebview.api.update_asistencia_config(config);
        if (res.success) {
            closeAsistenciaModal();
        } else {
            alert("Error al guardar: " + res.error);
        }
    }
}

const modalEl = document.getElementById('asistenciaModal');
if(modalEl){
    modalEl.addEventListener('click', (e) => {
        if (e.target.id === 'asistenciaModal') {
            closeAsistenciaModal();
        }
    });
}

async function resetearSesionActual() {
    if (!confirm("¿Seguro que quieres reiniciar la sesión actual?\n\nEsto permitirá que los usuarios que ya firmaron hoy vuelvan a usar el comando inmediatamente.")) {
        return;
    }

    if (window.pywebview && window.pywebview.api) {
        const res = await window.pywebview.api.reset_session_asistencias();
        if (res.success) {
            alert("✅ " + res.message);
        } else {
            alert("❌ Error: " + res.error);
        }
    }
}

// --- Lógica del Nuevo Modal de Datos ---

function openDataModal() {
    // Actualizar el título con la plataforma actual para que el usuario sepa qué va a borrar
    const platformTitle = document.getElementById('dataModalPlatform');
    if(platformTitle) {
        platformTitle.textContent = plataformaActual.charAt(0).toUpperCase() + plataformaActual.slice(1);
        
        // Colorcito dinámico según plataforma (opcional, detalle visual bonito)
        if(plataformaActual === 'twitch') platformTitle.style.color = '#bf94ff';
        else if(plataformaActual === 'kick') platformTitle.style.color = '#53fc18';
        else platformTitle.style.color = '#ff6666';
    }

    const modal = document.getElementById('dataModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
}

function closeDataModal() {
    const modal = document.getElementById('dataModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 200);
}

// Cerrar al hacer clic fuera
document.getElementById('dataModal').addEventListener('click', (e) => {
    if (e.target.id === 'dataModal') closeDataModal();
});

// --- FUNCIÓN PARA VACIAR LA BASE DE DATOS ---

async function vaciarBaseDeDatos() {
    // Convertimos a mayúsculas para que se vea bien en el mensaje (ej. TWITCH)
    const platNombre = plataformaActual.toUpperCase(); 
    
    // 1. Primera confirmación (Seguridad)
    if (!confirm(`⚠️ ¡PELIGRO DE BORRADO!\n\nEstás a punto de ELIMINAR TODOS los registros de asistencia de ${platNombre}.\n\nEsta acción no se puede deshacer.\n¿Estás seguro?`)) {
        return;
    }

    // 2. Segunda confirmación (Doble seguridad)
    if (!confirm(`¿De verdad? Se borrará todo el historial de ${platNombre} permanentemente.`)) {
        return;
    }

    // 3. Llamar a Python
    if (window.pywebview && window.pywebview.api) {
        // Llamamos a la función que creamos en el paso 2
        const res = await window.pywebview.api.clear_database_platform(plataformaActual);
        
        if (res.success) {
            alert("✅ Base de datos vaciada correctamente.");
            
            // Recargamos la tabla (se verá vacía)
            cargarAsistenciasBD(); 
            
            // Cerramos el modal de Datos
            closeDataModal(); 
        } else {
            alert("❌ Error al vaciar: " + res.error);
        }
    }
}

// streamcore_asistencias.js - Reemplaza la función del final

async function generarReporte() {
    // 1. Validar conexión
    if (!window.pywebview || !window.pywebview.api) {
        return alert("Error: API no disponible.");
    }

    // 2. Feedback visual (opcional)
    const btn = document.querySelector("button[onclick='generarReporte()']");
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Generando...";
    btn.disabled = true;

    try {
        // 3. Llamar a Python pasando la plataforma actual ('twitch', 'kick', etc.)
        const res = await window.pywebview.api.exportar_csv(plataformaActual);

        if (res.success) {
            alert(`✅ Reporte guardado exitosamente en:\n${res.path}`);
            closeDataModal(); // Cerramos el modal tras el éxito
        } else if (res.cancelled) {
            // El usuario canceló el diálogo de guardar, no hacemos nada o logueamos
            console.log("Exportación cancelada por el usuario.");
        } else {
            alert("❌ Error al exportar: " + res.error);
        }
    } catch (e) {
        console.error(e);
        alert("Error de comunicación con la API.");
    } finally {
        // Restaurar botón
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
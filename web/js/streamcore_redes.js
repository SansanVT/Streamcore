
async function initGlobalPlatformLogic() {
    // 1. Verificamos si la API de Python está lista
    if (!window.pywebview || !window.pywebview.api) {
        console.warn("(Global) Esperando a Pywebview...");
        return;
    }

    const container = document.querySelector('.platform-selector');
    if (!container) return; // No estamos en una página con selector (ej. Config)

    try {
        // 2. Pedimos el estado real a Python
        const status = await window.pywebview.api.get_all_auth_status();
        // Ejemplo respuesta: { twitch: {status: 'connected'}, kick: {status: 'disconnected'} }

        const btnTwitch = container.querySelector('.platform-btn.twitch');
        const btnKick = container.querySelector('.platform-btn.kick');
        const btnYoutube = container.querySelector('.platform-btn.youtube');

        let conectados = 0;
        let primeraPlataformaVisible = null;

        // --- HELPER: Muestra u oculta botones ---
        const gestionarBoton = (btn, estadoObj, nombrePlat) => {
            if (!btn) return;

            const estaConectado = estadoObj && estadoObj.status === 'connected';
            
            if (estaConectado) {
                btn.style.display = 'inline-flex';
                conectados++;
                if (!primeraPlataformaVisible) primeraPlataformaVisible = nombrePlat;
            } else {
                btn.style.display = 'none';
                btn.classList.remove('selected'); // Si estaba seleccionado, lo quitamos
            }
        };

        // 3. Aplicar lógica a cada botón
        gestionarBoton(btnTwitch, status.twitch, 'twitch');
        gestionarBoton(btnKick, status.kick, 'kick');
        gestionarBoton(btnYoutube, status.youtube, 'youtube'); // YouTube (oculto por ahora)


        // ==========================================
        // 🚫 CASO CRÍTICO: NINGUNA CUENTA CONECTADA
        // ==========================================
        if (conectados === 0) {
            // A. Cambiar el selector superior por un aviso discreto
            container.innerHTML = `
                <div class="text-gray-500 text-sm font-medium flex items-center bg-[#2a2a2b] px-3 py-1 rounded-lg border border-[#333]">
                    <span style="margin-right:6px">⚠️</span> Sin conexión
                </div>
            `;

            // B. Bloquear el contenido principal y mostrar mensaje de acción
            mostrarBloqueoDeLogin();
            return; 
        }

        // 4. AUTO-SELECCIÓN (Mejora de UX)
        // Si la plataforma actual se ocultó (porque se desconectó), cambiamos a la primera visible.
        const seleccionadoActual = container.querySelector('.platform-btn.selected');
        
        if ((!seleccionadoActual || seleccionadoActual.style.display === 'none') && primeraPlataformaVisible) {
            const btnAClickear = container.querySelector(`.platform-btn.${primeraPlataformaVisible}`);
            if (btnAClickear) {
                console.log(`(Global) Auto-cambiando vista a: ${primeraPlataformaVisible}`);
                btnAClickear.click(); 
                btnAClickear.classList.add('selected'); 
            }
        }

    } catch (e) {
        console.error("(Global) Error gestionando plataformas:", e);
    }
}

/**
 * Muestra un mensaje "Empty State" elegante en el centro de la pantalla
 * reemplazando el contenido funcional (Tabla, Grid o Layout).
 */
function mostrarBloqueoDeLogin() {
    // Diseño mejorado (Tarjeta central flotante)
    const htmlMensaje = `
        <div style="
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            height: 100%; 
            width: 100%;
            min-height: 400px; /* Altura mínima para que no se vea aplastado */
            text-align: center;
            animation: fadeIn 0.5s ease-out;
        ">
            <div style="
                background: #1a1a1b; 
                border: 1px solid #333; 
                padding: 40px; 
                border-radius: 16px; 
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                max-width: 400px;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">🔌</div>
                <h3 style="font-size: 24px; font-weight: bold; color: white; margin-bottom: 10px;">Conexión Requerida</h3>
                <p style="color: #999; margin-bottom: 30px; line-height: 1.5;">
                    Para gestionar tus comandos, asistencias y TTS, necesitas conectar al menos una plataforma de streaming.
                </p>
                <button onclick="window.location.href='streamcore_config.html'" 
                        style="
                            background: #3b82f6; 
                            color: white; 
                            border: none; 
                            padding: 12px 24px; 
                            border-radius: 8px; 
                            font-weight: 600; 
                            cursor: pointer; 
                            display: inline-flex; 
                            align-items: center; 
                            gap: 8px;
                            transition: background 0.2s;
                        "
                        onmouseover="this.style.background='#2563eb'"
                        onmouseout="this.style.background='#3b82f6'">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    Conectar Cuentas
                </button>
            </div>
        </div>
    `;

    // 1. GESTIÓN DE COMANDOS (Grid)
    const commandsGrid = document.getElementById('commandsGrid');
    if (commandsGrid) {
        // Ocultar controles superiores para limpiar la vista
        ocultarControles('.commands-controls');
        ocultarControles('.stats-grid'); // Ocultar estadísticas también
        
        commandsGrid.innerHTML = htmlMensaje;
        commandsGrid.style.display = 'block'; // Asegurar display block para que ocupe el ancho
    } 
    
    // 2. GESTIÓN DE ASISTENCIAS (Tabla)
    else if (document.getElementById('tablaAsistencias')) {
        // En asistencias, reemplazamos todo el contenedor de la tabla, no solo el tbody
        // Esto evita que queden los encabezados "Usuario", "Plataforma" flotando solos.
        const tableContainer = document.querySelector('.table-container') || document.querySelector('.overflow-hidden'); // Ajusta selector según tu HTML
        
        if(tableContainer) {
            ocultarControles('.commands-controls');
            tableContainer.innerHTML = htmlMensaje;
        } else {
            // Fallback si no encuentra el contenedor: vaciar tbody
            const tbody = document.getElementById('tablaAsistencias');
            tbody.innerHTML = `<tr><td colspan="100%" style="padding:0; border:none;">${htmlMensaje}</td></tr>`;
        }
    }
    
    // 3. TTS (Layout Complejo)
    else if (document.getElementById('ttsMainLayout')) {
        const ttsLayout = document.getElementById('ttsMainLayout');
        ttsLayout.style.display = 'none';
        
        const container = document.createElement('div');
        container.innerHTML = htmlMensaje;
        container.style.flex = "1"; // Ocupar espacio restante
        ttsLayout.parentNode.appendChild(container);
    }
}

// Función auxiliar para ocultar elementos por selector CSS
function ocultarControles(selector) {
    const el = document.querySelector(selector);
    if(el) el.style.display = 'none';
}

// Helper para ocultar barras de búsqueda/filtros
function ocultarControles(selector) {
    const controles = document.querySelector(selector);
    if(controles) controles.style.display = 'none';
}

// --- INICIALIZACIÓN ---
window.addEventListener('pywebviewready', initGlobalPlatformLogic);

// Respaldo por si el DOM carga después
document.addEventListener('DOMContentLoaded', () => {
    if (window.pywebview) initGlobalPlatformLogic();
});
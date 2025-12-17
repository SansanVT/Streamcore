// Variable global para almacenar el comando que se está editando
let editingCommand = null;
// Variable global para saber qué filtro de plataforma está activo
let currentPlatformFilter = 'twitch'; 

// --- RENDERIZADO DE TARJETAS ---
/**
 * Dibuja las tarjetas de comandos en la cuadrícula.
 * @param {Array} commandsList - La lista de comandos a renderizar.
 */
function renderCommands(commandsList = []) {
    const grid = document.getElementById('commandsGrid');
    grid.innerHTML = ''; // Limpia la cuadrícula

    if (commandsList.length === 0) {
        grid.innerHTML = '<p style="color: #A9A9A9; grid-column: 1 / -1; text-align: center;">No se encontraron comandos que coincidan con el filtro.</p>';
        return;
    }

    commandsList.forEach(command => {
        const commandCard = document.createElement('div');
        commandCard.className = 'command-card';
        
        const activeClass = command.active ? 'active' : '';
        const newActiveState = !command.active;
        
        commandCard.innerHTML = `
            <div class="command-header">
                <div>
                    <div class="command-name">${command.name}</div>
                    <div class="command-type">${getTypeLabel(command.type)}</div>
                </div>
                <div class="command-toggle ${activeClass}" onclick="toggleCommand(${command.id}, ${newActiveState})"></div>
            </div>
            
            <div class="command-response">${escapeHTML(command.response)}</div>
            
            <div class="command-stats">
                <div class="command-stat">
                    <svg class="command-stat-icon" fill="currentColor" viewBox="0 0 20 20"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    ${command.uses} usos
                </div>
                <div class="command-stat">
                    <svg class="command-stat-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"/></svg>
                    ${command.cooldown}s cooldown
                </div>
                <div class="command-stat">
                    <svg class="command-stat-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                    ${getPermissionLabel(command.permission)}
                </div>
            </div>
            
            <div class="command-actions">
                <button class="command-btn edit" onclick="editCommand(${command.id})">
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                    Editar
                </button>
            </div>
        `;
        grid.appendChild(commandCard);
    });
}

// --- FUNCIONES HELPERS ---
function getTypeLabel(type) {
    const labels = { 'text': 'Texto', 'counter': 'Contador', 'timer': 'Temporizador'};
    return labels[type] || type;
}

function getPermissionLabel(permission) {
    const labels = { 'everyone': 'Todos', 'subscribers': 'Subs', 'moderators': 'Mods', 'streamer': 'Streamer' };
    return labels[permission] || permission;
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- FUNCIONES DEL MODAL ---
function openCommandModal(command = null) {
    const modal = document.getElementById('commandModal');
    const form = document.getElementById('commandForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteBtn');
    
    editingCommand = command; // Almacena el comando que se está editando
    
    if (command) {
        // --- Modo Edición ---
        title.textContent = 'Editar Comando';
        document.getElementById('commandName').value = command.name;
        document.getElementById('commandType').value = command.type || 'text';
        document.getElementById('commandPermission').value = command.permission || 'everyone';
        document.getElementById('commandResponse').value = command.response;
        document.getElementById('commandCooldown').value = command.cooldown;
        document.getElementById('commandPermission').value = command.permission;
        document.getElementById('commandActive').checked = command.active;
        document.getElementById('commandActiveTwitch').checked = command.active_twitch;
        document.getElementById('commandActiveKick').checked = command.active_kick;
        deleteBtn.style.display = 'block';
    } else {
        // --- Modo Nuevo Comando ---
        title.textContent = 'Nuevo Comando';
        form.reset(); // Limpia campos
        // Establece valores por defecto
        document.getElementById('commandActive').checked = true;
        document.getElementById('commandActiveTwitch').checked = true;
        document.getElementById('commandActiveKick').checked = true;
        document.getElementById('commandCooldown').value = 5;
        document.getElementById('commandPermission').value = 'everyone';
        deleteBtn.style.display = 'none';
    }
    
    modal.classList.add('active');
}

function closeCommandModal() {
    document.getElementById('commandModal').classList.remove('active');
    editingCommand = null;
}

// --- INTERACCIONES CON LA API (Python) ---

async function editCommand(id) {
    try {
        // Llama a Python para obtener la lista completa
        const allCommands = await window.pywebview.api.get_commands();
        const commandToEdit = allCommands.find(c => c.id === id);
        if (commandToEdit) {
            openCommandModal(commandToEdit);
        }
    } catch (e) {
        console.error("Error al buscar comando para editar:", e);
        alert("Error al cargar datos del comando.");
    }
}

async function deleteCommand() {
    if (editingCommand && confirm('¿Estás seguro de que quieres eliminar este comando? Esta acción no se puede deshacer.')) {
        try {
            // Llama a Python para borrar de la BD
            await window.pywebview.api.delete_command(editingCommand.id);
            closeCommandModal();
            filterCommands(); // Recarga la lista
        } catch (e) {
            console.error("Error al eliminar comando:", e);
            alert("Error al eliminar el comando.");
        }
    }
}

async function toggleCommand(id, newStatus) {
    try {
        // Llama a Python para actualizar el estado 'active'
        await window.pywebview.api.toggle_command_status(id, newStatus);
        filterCommands(); // Recarga la lista
    } catch (e) {
        console.error("Error al cambiar estado:", e);
        alert("Error al actualizar el comando.");
    }
}

// --- MANEJO DEL FORMULARIO ---
document.getElementById('commandForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // 1. Recolecta los datos del formulario
    const formData = {
        name: document.getElementById('commandName').value.toLowerCase().trim(),
        type: document.getElementById('commandType').value,
        permission: document.getElementById('commandPermission').value,
        response: document.getElementById('commandResponse').value.trim(),
        cooldown: parseInt(document.getElementById('commandCooldown').value) || 0,
        active: document.getElementById('commandActive').checked,
        active_twitch: document.getElementById('commandActiveTwitch').checked,
        active_kick: document.getElementById('commandActiveKick').checked
    };

    // 2. Validaciones simples
    if (!formData.name.startsWith('!')) {
        alert('El nombre del comando debe empezar con "!"');
        return;
    }
    if (formData.name.split(' ').length > 1) {
        alert('El nombre del comando no puede contener espacios.');
        return;
    }
    if (!formData.response) {
        alert('El comando debe tener una respuesta.');
        return;
    }
    if (formData.response.startsWith('/')) {
        alert('Por seguridad, la respuesta no puede iniciar con "/" (comandos de moderación prohibidos).');
        return;
    }

    let result;
    try {
        // 3. Llama a la API de Python (Crear o Actualizar)
        if (editingCommand) {
            result = await window.pywebview.api.update_command(editingCommand.id, formData);
        } else {
            result = await window.pywebview.api.create_command(formData);
        }

        // 4. Procesa la respuesta de Python
        if (result.success) {
            closeCommandModal();
            filterCommands(); // Recarga la lista
        } else {
            alert('Error: ' + result.error); // Muestra error (ej. "comando ya existe")
        }
    } catch (error) {
        console.error('Error al guardar el comando:', error);
        alert('Ocurrió un error inesperado. Revisa la consola (F12).');
    }
});

// --- BÚSQUEDA Y FILTRADO ---
document.getElementById('searchInput').addEventListener('input', filterCommands);
document.getElementById('typeFilter').addEventListener('change', filterCommands);
document.getElementById('statusFilter').addEventListener('change', filterCommands);

async function filterCommands() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    try {
        // 1. Llama a Python para obtener la lista fresca
        const allCommands = await window.pywebview.api.get_commands();
        
        // 2. Filtra la lista en JavaScript
        let filtered = allCommands.filter(command => {
            const matchesSearch = command.name.toLowerCase().includes(searchTerm) || 
                                  command.response.toLowerCase().includes(searchTerm);
            
            const matchesType = !typeFilter || command.type === typeFilter;
            
            const matchesStatus = !statusFilter || 
                                  (statusFilter === 'active' && command.active == 1) ||
                                  (statusFilter === 'inactive' && command.active == 0);
            
            // Filtro de plataforma (Twitch o Kick)
            const matchesPlatform = (currentPlatformFilter === 'twitch' && command.active_twitch == 1) ||
                                    (currentPlatformFilter === 'kick' && command.active_kick == 1);
            
            return matchesSearch && matchesType && matchesStatus && matchesPlatform;
        });
        
        // 3. Renderiza solo la lista filtrada
        renderCommands(filtered);
    } catch (e) {
        console.error("Error al filtrar comandos:", e);
        alert("Error al cargar la lista de comandos.");
    }
}

// --- FILTRO DE PLATAFORMA (Botones) ---
document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // Ignora el botón de YouTube
        if (this.classList.contains('youtube')) {
            return; 
        }

        // Cambia la clase 'active'
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Actualiza la variable global del filtro
        if (this.classList.contains('twitch')) {
            currentPlatformFilter = 'twitch';
        } else if (this.classList.contains('kick')) {
            currentPlatformFilter = 'kick';
        }
        
        // Vuelve a filtrar y renderizar la lista
        filterCommands();
    });
});

// --- NAVEGACIÓN (Sidebar) ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
        // Marca el ítem activo, la navegación real ocurre por el 'onclick' del HTML
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});

// --- CARGA INICIAL (TAREAS DEL DOM) ---
// Estas son tareas seguras que no dependen de la API de Python.
document.addEventListener('DOMContentLoaded', () => {
    // Oculta el botón de YouTube
    const youtubeBtn = document.querySelector('.platform-btn.youtube');
    if (youtubeBtn) {
        youtubeBtn.style.display = 'none';
    }

    // Activa el 'nav-item' de Comandos
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.textContent.trim() === 'Comandos') {
            item.classList.add('active');
        }
    });
});

// --- INICIO DE API (ESPERA A PYWEBVIEW) ---
window.addEventListener('pywebviewready', () => {
    const twitchBtn = document.querySelector('.platform-btn.twitch');
    if (twitchBtn) {
        // Ahora esta llamada es segura
        twitchBtn.click(); 
    } else {
        // Fallback si no se encuentra el botón
        filterCommands(); 
    }
});

// --- ESTADÍSTICAS ---
async function loadStats() {
    if (!window.pywebview || !window.pywebview.api) return;

    try {
        const stats = await window.pywebview.api.get_command_stats();
        // stats = { active: 5, total: 10, uses: 150, popular: "!social" }
        
        // Animamos los números (opcional, o solo asignamos textContent)
        document.getElementById('statActive').textContent = stats.active;
        document.getElementById('statUses').textContent = stats.uses.toLocaleString(); // Pone comas (1,456)
        document.getElementById('statPopular').textContent = stats.popular;
        document.getElementById('statTotal').textContent = stats.total;
        
    } catch (e) {
        console.error("Error cargando stats:", e);
    }
}

// Agregar loadStats a la carga inicial y cuando se crea/borra un comando
window.addEventListener('pywebviewready', () => {
    // ... tu código existente ...
    loadStats(); // <--- Cargar stats al inicio
});

// Tip: Llama a loadStats() también dentro de 'filterCommands()' o 'closeCommandModal'
// para que se actualice si creas uno nuevo.

// --- CERRAR MODAL (click fuera) ---
document.getElementById('commandModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeCommandModal();
    }
});

// --- EVENTOS REAL-TIME (PUSH) ---
// En lugar de preguntar cada 5s, esperamos a que Python nos avise.
window.addEventListener('stats:updated', () => {
    console.log("(UI) Recibido evento de actualización de stats");
    loadStats(); // Recargar solo los números
    
    // Opcional: Si quieres que la tabla también se actualice en tiempo real
    // filterCommands(); 
});
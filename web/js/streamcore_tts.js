// streamcore_tts.js - TTS Híbrido (WebAudio + Backend Control)

// Cola de TTS
let ttsQueue = []; // { id, user, message, audio, status: 'pending'|'playing' }
let currentlyPlayingId = null;
let ttsEnabled = true;

// Audio / WebAudio (Solo para pruebas locales en navegador)
let audioCtx = null;
let gainNode = null;
let currentSource = null;

// Valores de control (por defecto)
// Valores de control (por defecto)
let controlVolume = 80; 
let controlSpeed = 0.7; // <--- CAMBIO CLAVE: De 1.0 a 0.6
let controlPitchSemitones = 0; // -12 .. +12

var speedSlider = document.getElementById('speedSlider');
var speedValue = document.getElementById('speedValue');



// ----------------- COMUNICACIÓN CON BACKEND (NUEVO) -----------------
function sendConfigToBackend() {
    // Esta función envía los valores de los sliders a Python
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.update_tts_settings({
            volume: controlVolume, 
            speed: controlSpeed,
            pitch: controlPitchSemitones
        }).catch(err => console.log("Error enviando config al backend:", err));
    }
}

// ----------------- UTILIDADES -----------------
function escapeHtml(text){
    return String(text || "").replace(/[&<>"']/g, function(m){
        return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[m];
    });
}

// ----------------- UI / Cola -----------------
function updateQueueUI(){
    const list = document.getElementById('queueList');
    const count = document.getElementById('queueCount');
    if(!list || !count) return;

    list.innerHTML = '';
    if(ttsQueue.length === 0){
        list.innerHTML = `<div style="padding:24px; color:#A9A9A9;">No hay mensajes en la cola</div>`;
        count.textContent = 'Cola vacía';
        return;
    }

    count.textContent = ttsQueue.length === 1 ? '1 mensaje' : `${ttsQueue.length} mensajes`;

    ttsQueue.forEach(item=>{
        const div = document.createElement('div');
        div.className = 'queue-item ' + (item.status || 'pending');
        div.style.padding = '12px';
        div.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:14px;">${escapeHtml(item.user)}</strong>
                <span style="font-size:12px; opacity:0.8;">${item.status === 'playing' ? 'Reproduciendo' : 'En cola'}</span>
            </div>
            <div style="margin-top:8px; font-size:13px;">${escapeHtml(item.message)}</div>
            <div style="margin-top:8px;">
                <button class="btn" onclick="skipTTS(${item.id})" style="margin-right:8px;">Saltar</button>
                <button class="btn" onclick="removeTTS(${item.id})">Eliminar</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function enqueueTTS(user, message, audioBase64=null){
    const item = {
        id: Date.now() + Math.floor(Math.random()*999),
        user: user || 'Anon',
        message: message || '',
        audio: audioBase64 || null,
        status: 'pending'
    };
    ttsQueue.push(item);
    updateQueueUI();

    if(!currentlyPlayingId && ttsEnabled){
        playNextTTS();
    }
}

// ----------------- WebAudio Setup -----------------
function setupAudioSystemPro(){
    if(!audioCtx){
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(!gainNode){
        gainNode = audioCtx.createGain();
        gainNode.gain.value = controlVolume/100;
        gainNode.connect(audioCtx.destination);
    }
}

// ----------------- REPRODUCCIÓN (LÓGICA HÍBRIDA) -----------------
async function playNextTTS(){
    if(!ttsEnabled) return;
    if(currentlyPlayingId) return;

    const next = ttsQueue.find(i=>i.status==='pending');
    if(!next) return;

    next.status = 'playing';
    currentlyPlayingId = next.id;
    updateQueueUI();

    setupAudioSystemPro();

    try {
        let base64Audio = next.audio;

        // [MODIFICACIÓN IMPORTANTE]
        // Si NO hay audio Base64, asumimos que el Backend (Python) lo está reproduciendo.
        // Aquí solo mostramos la animación visual para no duplicar el sonido.
        if(!base64Audio){
            console.log("Audio gestionado por Backend (Segundo plano). Modo visual activo.");
            
            // Calculamos duración visual estimada (100ms por letra + 1s base)
            const estimatedDuration = 1000 + (next.message.length * 100);

            setTimeout(() => {
                finishCurrentAndContinue(next.id);
            }, estimatedDuration);
            
            return; // SALIR AQUÍ: No reproducir nada en el navegador
        }

        // [SI HAY AUDIO] (Ej: Botón de prueba "Test TTS")
        // Reproducimos usando el navegador
        const response = await fetch(base64Audio);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        if(currentSource){
            currentSource.stop();
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Aplicamos efectos locales (Solo funcionan en pruebas web)
        source.playbackRate.value = controlSpeed;
        source.detune.value = controlPitchSemitones * 100; 
        source.connect(gainNode);

        source.onended = () => {
            currentSource = null;
            finishCurrentAndContinue(next.id);
        };

        currentSource = source;
        source.start();

    } catch(err){
        console.error('Error reproduciendo TTS:', err);
        finishCurrentAndContinue(next.id);
    }
}

function finishCurrentAndContinue(id){
    ttsQueue = ttsQueue.filter(i=>i.id!==id);
    currentlyPlayingId = null;
    updateQueueUI();
    setTimeout(()=>playNextTTS(), 200);
}

// ----------------- Saltar / Eliminar -----------------
function skipTTS(id){
    // Si estamos reproduciendo audio web (Test), lo detenemos
    if(currentlyPlayingId===id && currentSource){
        currentSource.stop();
        currentSource = null;
    }
    // Si es backend, no podemos detener el audio de python desde aquí fácilmente,
    // pero limpiamos la UI inmediatamente.
    
    finishCurrentAndContinue(id);
}

function removeTTS(id){
    // Si intentamos borrar algo que no se está reproduciendo
    if (currentlyPlayingId !== id) {
        ttsQueue = ttsQueue.filter(i=>i.id!==id);
        updateQueueUI();
    } else {
        skipTTS(id);
    }
}

// ----------------- Sliders / Controles -----------------
function applyControlsPro(){
    // Aplica cambios al audio web actual (si hay uno sonando)
    if(gainNode) gainNode.gain.value = controlVolume/100;
    if(currentSource){
        currentSource.playbackRate.value = controlSpeed;
        currentSource.detune.value = controlPitchSemitones*100;
    }
}

function getUISpeed(rawValue) {
    // Convierte el valor REAL (0.6) al valor VISUAL (1.0)
    // Usamos parseFloat para asegurar la suma numérica
    return (parseFloat(rawValue) + 0.4).toFixed(1);
}

async function initControlsBindings(){
    const speedSlider = document.getElementById('speedSlider');
    const volumeSlider = document.getElementById('volumeSlider');

    const speedValue = document.getElementById('speedValue');
    const volumeValue = document.getElementById('volumeValue');

    // En el bloque de cargar config:
    if(speedSlider) { speedSlider.value = controlSpeed; speedValue.textContent = controlSpeed + 'x'; }

    // 1. CARGAR CONFIGURACIÓN GUARDADA
    if (window.pywebview && window.pywebview.api) {
        try {
            const res = await window.pywebview.api.get_tts_config();
            if (res.success) {
                const cfg = res.data;
                
                // Actualizar variables locales
                controlVolume = cfg.volume || 80;
                controlSpeed = cfg.speed || 0.;

                // Actualizar UI visualmente
                if(volumeSlider) { volumeSlider.value = controlVolume; volumeValue.textContent = controlVolume + '%'; }
                if(speedSlider) { speedSlider.value = controlSpeed; speedValue.textContent = controlSpeed + 'x'; }
            }
        } catch(e) {
            console.error("Error cargando config TTS", e);
        }
    }

    if(volumeSlider) { 
        volumeSlider.value = controlVolume; 
        volumeValue.textContent = controlVolume + '%'; 
    }
    
    if(speedSlider) { 
        // Establecer el valor real (0.6) en el slider
        speedSlider.value = controlSpeed; 
        
        // Mostrar el valor CORREGIDO (1.0x)
        if(speedValue) {
            speedValue.textContent = getUISpeed(controlSpeed) + 'x'; 
        }
    }

    // 3. LISTENERS (Para enviar cambios)
    if(speedSlider){
        speedSlider.addEventListener('input', function(){
            const rawValue = parseFloat(this.value) || 0.6;
            
            // 1. Guardar el valor REAL (0.6) que va al backend
            controlSpeed = rawValue; 
            
            // 2. Mostrar el valor CORREGIDO (1.0x)
            if(speedValue) {
                speedValue.textContent = getUISpeed(rawValue) + 'x';
            }
            
            sendConfigToBackend(); 
        });
    }

    if(volumeSlider){
        volumeSlider.addEventListener('input', function(){
            controlVolume = parseInt(this.value) || 80;
            if(volumeValue) volumeValue.textContent = controlVolume + '%';
            applyControlsPro();
            sendConfigToBackend();
        });
    }

    if(volumeSlider){
        volumeSlider.addEventListener('input', function(){
            controlVolume = parseInt(this.value) || 80;
            if(volumeValue) volumeValue.textContent = controlVolume + '%';
            sendConfigToBackend();
        });
    }

    // Enviar configuración inicial al arrancar
    setTimeout(sendConfigToBackend, 1000);
}

// ----------------- Eventos pywebview -----------------
window.addEventListener("tts:new", async (ev) => {
    try {
        const data = ev.detail || {};
        const user = data.user || 'Anon';
        const message = data.message || '';
        const audio = data.audio || null; // Si es null, es modo Backend
        enqueueTTS(user, message, audio);
    } catch(e){ console.error('Error manejando tts:new', e); }
});

// ----------------- Inicialización -----------------
window.addEventListener('DOMContentLoaded',()=>{
    setupAudioSystemPro();
    initControlsBindings();

    const enableBtn = document.getElementById('enableTtsBtn');
    if(enableBtn){
        enableBtn.addEventListener('click', ()=>{
            ttsEnabled = !ttsEnabled;
            enableBtn.textContent = ttsEnabled ? 'Pausar TTS' : 'Activar TTS';
            if(ttsEnabled) playNextTTS();
        });
        enableBtn.textContent = ttsEnabled ? 'Pausar TTS' : 'Activar TTS';
    }

    updateQueueUI();
});

// ----------------- TEST TTS DESDE LA UI (MODO REAL) -----------------
async function testTTS(){
    const textEl = document.getElementById("testMessage");
    if(!textEl) return alert("No se encontró textarea de prueba.");
    const text = textEl.value.trim();
    if(!text) return alert("Escribe un mensaje primero.");

    // Verificamos que exista la función de encolar
    if(!window.pywebview || !window.pywebview.api || !window.pywebview.api.tts_enqueue){
        return alert("API de TTS no disponible.");
    }

    // [CAMBIO IMPORTANTE]
    // En lugar de pedir el audio para tocarlo aquí, enviamos el mensaje 
    // a la cola del Backend. Python se encargará del audio y enviará 
    // el evento 'tts:new' para que se actualice la lista visual.
    try {
        const res = await window.pywebview.api.tts_enqueue("Prueba", text);
        
        if(!res || !res.success) {
            alert("Error al encolar el TTS de prueba.");
        }
        // No necesitamos hacer nada más aquí. 
        // El evento 'tts:new' que emite Python actualizará la UI automáticamente.
    } catch(e) {
        console.error("Error al llamar a tts_enqueue:", e);
    }
}

// En tu streamcore_tts.js
function toggleTTS() {
    const isCurrentlyEnabled = ttsEnabled;
    const newState = !isCurrentlyEnabled;

    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.toggle_tts_status(newState).then(res => {
            if (res.success) {
                ttsEnabled = newState;
                
                // Actualizar texto del botón (Tu lógica ya la tenías bien)
                const enableBtn = document.getElementById('enableTtsBtn');
                enableBtn.textContent = newState ? 'Pausar TTS' : 'Activar TTS';
                // ... (lógica de clases visuales) ...

                if (ttsEnabled) playNextTTS(); // Si activamos, intentamos reproducir
            }
        });
    }
}

// En tu streamcore_tts.js, busca la línea del botón Limpiar Cola.
// El onclick ya debe estar ahí, pero asegúrate de que llame a esta función JS:

function clearQueue() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.clear_tts_queue().then(res => {
            if (res.success) {
                ttsQueue = []; // Limpiamos la cola visual de JavaScript
                updateQueueUI(); 
            }
        });
    }
}


// Archivo: streamcore_tts.js (Función saveTtsCommandSettings)

// Archivo: streamcore_tts.js

/**
 * Guarda la configuración del comando TTS y sus permisos.
 */
function saveTtsCommandSettings() {
    // 1. Recopilación de Datos
    const commandName = document.getElementById('ttsCommand').value.trim();
    
    // *** PARCHE DE MINÚSCULAS: Convertir el valor a minúsculas antes de guardar ***
    const permission = document.getElementById('ttsPermission').value.toLowerCase(); 
    
    // Obtener el contenido del textarea
    const profanityListRaw = document.querySelector('.tts-settings textarea').value.trim();

    // 2. Validación y Pre-procesamiento
    if (!commandName) {
        alert('❌ Error: El nombre del comando TTS no puede estar vacío.');
        return;
    }

    // *** ZONA CRÍTICA: Definir la variable bannedWords aquí ***
    const bannedWords = profanityListRaw
        .split(',')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);
    // *** FIN ZONA CRÍTICA ***

    // 3. Objeto Final de Configuración
    const settingsToSend = {
        // Aseguramos que el comando empiece con '!'
        command: `!${commandName.replace(/^!/, '')}`, 
        tts_permission: permission, // Valor en minúsculas y clave correcta
        banned_words: bannedWords, // <-- ¡Ahora está definida!
    };

    console.log('📦 Enviando configuración de comando al backend:', settingsToSend);
    
    // 4. Llama a la nueva función de la API de Python
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_tts_command_config) {
        window.pywebview.api.save_tts_command_config(settingsToSend) 
            .then(response => {
                if (response.success) {
                    alert('✅ Configuración de TTS guardada exitosamente.');
                } else {
                    alert('❌ Error al guardar: ' + (response.error || 'Desconocido'));
                }
            })
            .catch(error => {
                console.error('❌ Error de comunicación con la API:', error);
                alert('❌ Error de comunicación. Revisa la consola.');
            });
    } else {
        alert('⚠️ API de backend no disponible. Simulación de guardado exitoso.');
    }
}

function loadTtsCommandSettings() {
    // 1. Verificar la disponibilidad de la API
    if (window.pywebview && window.pywebview.api && window.pywebview.api.get_tts_config) {
        console.log('📦 Solicitando configuración de comando TTS al backend...');

        // Llamar a la API de Python. La promesa devuelve el objeto completo {success: true, data: {...}}
        window.pywebview.api.get_tts_config()
            .then(response => { 
                console.log('✅ Configuración de TTS recibida:', response);
                
                // *** CORRECCIÓN CLAVE: Usar response.data para obtener el objeto de configuración ***
                const config = response.data || {};
                
                // 1. Obtener valores o usar valores por defecto
                const command = config.command || '!decir'; 
                
                // *** CORRECCIÓN: Usar 'tts_permission', que es el nombre de la clave en el backend ***
                const permission = (config.tts_permission || 'all').toLowerCase();
                
                // El backend devuelve 'banned_words', aunque esté vacío []
                const bannedWordsArray = config.banned_words || [];

                // 2. Rellenar los campos del formulario
                
                // Campo Comando (!decir)
                const ttsCommandInput = document.getElementById('ttsCommand');
                if (ttsCommandInput) {
                    ttsCommandInput.value = command.startsWith('!') ? command.substring(1) : command; 
                }

                // Campo Permiso Mínimo
                const ttsPermissionSelect = document.getElementById('ttsPermission');
                if (ttsPermissionSelect) {
                    // Esto debería seleccionar el permiso guardado (ej. 'subscriber' o 'moderator')
                    ttsPermissionSelect.value = permission; 
                }

                // Campo Palabras Prohibidas (textarea)
                const bannedWordsTextarea = document.querySelector('.tts-settings textarea');
                if (bannedWordsTextarea) {
                    bannedWordsTextarea.value = bannedWordsArray.join(', ');
                }
            })
            .catch(error => {
                console.error('❌ Error al cargar la configuración de TTS:', error);
            });
    } else {
        console.warn('⚠️ API de backend no disponible. La configuración no se cargará automáticamente.');
    }
}

// Asegurarse de que esta función se llame al cargar la página
window.addEventListener('pywebviewready', loadTtsCommandSettings);


// En: src/web/js/streamcore_config.js

(function () {
  'use strict';

  // --- Estado ---
  let currentSection = 'platforms';
  const platformColors = { /* ... (tu objeto de colores) ... */ };

  // === ¡NUEVAS FUNCIONES DE LÓGICA DE AUTH! ===

  /**
   * Llama a la API de Python para obtener el estado de todas las plataformas
   * y actualiza la UI.
   */
  async function loadAuthStatus() {
    console.log("Cargando estado de autenticación...");
    try {
      if (!window.pywebview || !window.pywebview.api) {
        console.warn("pywebview no está listo. Reintentando en 500ms...");
        setTimeout(loadAuthStatus, 500);
        return;
      }
      
      const status = await window.pywebview.api.get_all_auth_status();
      console.log("Estado recibido de Python:", status);

      // Actualiza la UI para cada plataforma
      updatePlatformUI("twitch", status.twitch);
      updatePlatformUI("kick", status.kick);
      updatePlatformUI("youtube", status.youtube);

    } catch (e) {
      console.error("Error al cargar el estado de autenticación:", e);
      showNotification('Error al cargar estado de conexión', 'error');
    }
  }

  /**
   * Función genérica para actualizar el HTML de una tarjeta de plataforma.
   * @param {string} platform - "twitch", "kick", etc.
   * @param {object} data - El objeto de estado, ej: {status: "connected", ...}
   */
  function updatePlatformUI(platform, data) {
    if (!data) return; // Salir si la plataforma no existe

    // Obtenemos TODOS los elementos
    const platformImg = document.getElementById(`platform-img-${platform}`);
    const connectBtn = document.getElementById(`connect-btn-${platform}`);
    const profileView = document.getElementById(`profile-view-${platform}`);
    const profilePic = document.getElementById(`profile-pic-${platform}`);
    const profileName = document.getElementById(`profile-name-${platform}`);

    // Asegurarse de que todos los elementos existan antes de manipularlos
    if (!platformImg || !connectBtn || !profileView || !profilePic || !profileName) {
      console.warn(`Elementos de UI no encontrados para: ${platform}`);
      return;
    }

    if (data.status === "connected") {
      // --- ESTADO CONECTADO ---
      platformImg.style.display = 'none'; // OCULTA EL LOGO
      connectBtn.style.display = 'none';   // OCULTA "Acceder"
      profileView.style.display = 'flex'; // MUESTRA la vista de perfil
      
      profilePic.src = data.profile_pic || 'img/default-avatar.png'; // (Asegúrate de tener una img por defecto)
      profileName.textContent = data.username;
      
    } else {
      // --- ESTADO DESCONECTADO ---
      platformImg.style.display = 'block'; // MUESTRA EL LOGO
      connectBtn.style.display = 'flex';   // MUESTRA "Acceder"
      profileView.style.display = 'none';  // OCULTA la vista de perfil
      connectBtn.textContent = 'Acceder';  // Resetea el texto por si decía "Conectando..."
    }
  }

  /**
   * Inicia la autenticación para una plataforma.
   * @param {string} platform - "twitch", "kick"
   */
  async function connect(platform) {
    console.log(`Iniciando conexión ${platform}...`);
    const connectBtn = document.getElementById(`connect-btn-${platform}`);
    
    if (!window.pywebview || !window.pywebview.api) {
      showNotification('Error: la API no está disponible', 'error');
      return;
    }

    try {
      let response = null;
      if (platform === 'twitch') {
        connectBtn.textContent = 'Revisa tu navegador...';
        response = await window.pywebview.api.run_twitch_auth();
      } else if (platform === 'kick') {
        connectBtn.textContent = 'Revisa tu navegador...';
        response = await window.pywebview.api.run_kick_auth();
      } else {
        showNotification(`Conexión con ${platform} no implementada`, 'info');
        return;
      }

      if (response && response.success) {
        showNotification(`Proceso de ${platform} iniciado.`, 'success');
        // El hilo de Python publicará 'auth:status_changed'
        // pero por si acaso, recargamos después de un tiempo
        setTimeout(loadAuthStatus, 15000); // 15 seg para que el usuario termine
      } else {
        showNotification(response.message || `Error al iniciar ${platform}`, 'error');
        connectBtn.textContent = 'Acceder'; // Resetea el botón si falla
      }
    } catch (e) {
      console.error(`Error fatal al conectar ${platform}`, e);
      showNotification(`Error fatal al conectar ${platform}`, 'error');
      connectBtn.textContent = 'Acceder'; // Resetea el botón si falla
    }
  }

  /**
   * Desconecta una plataforma.
   * @param {string} platform - "twitch", "kick"
   */
  async function disconnect(platform) {
    console.log(`Desconectando ${platform}...`);
    
    if (!confirm(`¿Estás seguro de que quieres desconectar tu cuenta de ${platform}?`)) {
        return;
    }
    
    try {
        let response = await window.pywebview.api.run_logout(platform);
        if (response.success) {
            showNotification(`Desconectado de ${platform}`, 'success');
            loadAuthStatus(); // Recarga la UI inmediatamente
        } else {
            showNotification(response.message || `Error al desconectar ${platform}`, 'error');
        }
    } catch (e) {
        console.error("Error fatal al desconectar:", e);
        showNotification('Error fatal al desconectar', 'error');
    }
  }

  // === FIN DE NUEVAS FUNCIONES ===


  // --- Inicializador (MODIFICADO) ---
  function initializeConfig() {
    setupMenuNavigation();
    setupPlatformSelector();
    setupFormHandlers();
    setupNavItems();
    setupAccessButtons();
    setupDisconnectButtons(); // ¡NUEVO!
    setupSaveButtons();
    setupTestButtons();
    
    // Carga el estado de login al iniciar
    // Usamos pywebviewready si está disponible, si no, DOMContentLoaded
    if (window.pywebview) {
        window.addEventListener('pywebviewready', loadAuthStatus);
    } else {
        document.addEventListener('DOMContentLoaded', loadAuthStatus);
    }
  }

  // ( ... tus funciones setupMenuNavigation, setupPlatformSelector, setupFormHandlers, setupNavItems ... )
  // ( ... estas funciones están bien como están en tu archivo ... )

  // Botones "Acceder" para plataformas (MODIFICADO)
  function setupAccessButtons() {
    document.querySelectorAll('.btn.access-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const platform = this.dataset.platform;
        if (platform) {
          connect(platform); // Llama a nuestra nueva función genérica
        }
      });
    });
  }

  // ¡NUEVA FUNCIÓN DE SETUP!
  function setupDisconnectButtons() {
    document.querySelectorAll('.btn.disconnect-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const platform = this.dataset.platform;
        if (platform) {
          disconnect(platform); // Llama a nuestra nueva función de desconexión
        }
      });
    });
  }

  // ( ... resto de tus funciones: setupSaveButtons, setupTestButtons, saveSettings, etc... )
  // ( ... pégalas aquí sin cambios ... )

  // --- COPIA EL RESTO DE TUS FUNCIONES JS AQUÍ ---
  // (setupMenuNavigation, setupPlatformSelector, setupFormHandlers, setupNavItems,
  // setupSaveButtons, setupTestButtons, saveSettings, copyToClipboard, 
  // generateApiKey, updateThemeColor, showNotification)

  // (Asegúrate de copiar todas tus funciones de ayuda aquí para que
  //  showNotification, etc. estén definidas)
  
  // --- Ejemplo de showNotification (por si acaso) ---
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 16px 24px;
      background: ${type === 'success' ? '#53FC18' : type === 'error' ? '#FF4444' : '#9146FF'};
      color: ${type === 'success' ? '#000' : '#FFF'};
      border-radius: 12px; font-weight: 500; z-index: 10000;
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 8px 25px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  // (Pega el resto de tus funciones aquí)
  
  // (Tu código original)
  function setupMenuNavigation() {
    const menuItems = Array.from(document.querySelectorAll('.config-menu-item'));
    const sections = Array.from(document.querySelectorAll('.config-section'));
    menuItems.forEach(item => {
      item.addEventListener('click', function () {
        const sectionId = this.dataset.section;
        menuItems.forEach(mi => mi.classList.remove('active'));
        this.classList.add('active');
        sections.forEach(section => {
          section.classList.remove('active');
          section.setAttribute('aria-hidden', 'true');
          if (section.id === sectionId) {
            section.classList.add('active');
            section.classList.add('fade-in');
            section.setAttribute('aria-hidden', 'false');
          }
        });
        currentSection = sectionId;
      });
    });
  }
  function setupPlatformSelector() {
    document.querySelectorAll('.platform-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const platform = this.dataset.platform || 'twitch';
        const colors = platformColors[platform] || platformColors.twitch;
        const platformText = this.textContent.trim();
        const statusText = document.querySelector('.connection-text');
        if (statusText) statusText.textContent = `Conectado a ${platformText}`;
        const connectionStatus = document.querySelector('.connection-status');
        const statusDot = document.querySelector('.status-dot');
        if (connectionStatus) {
          connectionStatus.style.background = colors.glow;
          connectionStatus.style.borderColor = colors.primary + '50';
        }
        if (statusDot) statusDot.style.background = colors.primary;
      });
    });
  }
  function setupFormHandlers() {
    document.querySelectorAll('input[type="range"]').forEach(range => {
      range.addEventListener('input', function () {
        const description = this.parentNode.querySelector('.form-description');
        if (description) {
          if (this.min === '0.5' && this.max === '2') {
            description.textContent = `Actual: ${this.value}x ${this.value == 1 ? '(Normal)' : this.value < 1 ? '(Lento)' : '(Rápido)'}`;
          } else if (this.min === '-20' && this.max === '20') {
            description.textContent = `Actual: ${this.value} ${this.value == 0 ? '(Neutral)' : this.value < 0 ? '(Grave)' : '(Agudo)'}`;
          } else {
            description.textContent = `Actual: ${this.value}`;
          }
        }
      });
    });
    document.querySelectorAll('.toggle-switch input').forEach(toggle => {
      toggle.addEventListener('change', function () {
        console.log(`Toggle ${this.closest('.form-group') ? this.closest('.form-group').textContent.trim().slice(0,50) : ''}: ${this.checked}`);
      });
    });
    document.querySelectorAll('.color-picker').forEach(picker => {
      picker.addEventListener('change', function () {
        const label = this.parentNode.querySelector('.color-label');
        if (label) updateThemeColor(label.textContent, this.value);
      });
    });
  }
  function setupNavItems() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', function () {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        const href = this.dataset.href;
        if (href) {
          window.location.href = href;
        }
      });
    });
  }
  function setupSaveButtons() {
    document.querySelectorAll('button[data-action="save"]').forEach(btn => {
      btn.addEventListener('click', function (ev) {
        const section = this.dataset.section || currentSection;
        saveSettings(section, ev);
      });
    });
  }
  function setupTestButtons() {
    const testAlerts = document.getElementById('test-alerts-btn');
    const testTTS = document.getElementById('test-tts-btn');
    if (testAlerts) testAlerts.addEventListener('click', () => showNotification('Prueba de alertas enviada', 'success'));
    if (testTTS) testTTS.addEventListener('click', () => showNotification('Prueba de TTS', 'success'));
  }
  function saveSettings(section, event) {
    const btn = event && event.currentTarget ? event.currentTarget : document.querySelector(`button[data-action="save"][data-section="${section}"]`);
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = '✓ Guardado';
      btn.classList.add('save-success');
      showNotification('Configuración guardada exitosamente', 'success');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        btn.classList.remove('save-success');
      }, 2000);
    }, 1500);
  }

  // Listener para botón Conectar YouTube
// Listener para botón Conectar YouTube (PROTEGIDO)
  const btnYoutube = document.getElementById('connect-btn-youtube');
  if (btnYoutube) { // Solo agregamos el evento si el botón existe
      btnYoutube.addEventListener('click', () => {
          if (window.pywebview && window.pywebview.api) {
              window.pywebview.api.run_youtube_auth().then(res => {
                  alert(res.message);
              });
          }
      });
  }
  
  // Listener para el evento de éxito (actualizar UI)
  window.addEventListener('auth:youtube_completed', (event) => {
      if (event.detail.success) {
          alert("¡YouTube Conectado! Hola " + event.detail.username);
          // Aquí deberías llamar a una función para cambiar la tarjeta a estado "Conectado"
          // ej: updatePlatformUI('youtube', true, event.detail.username);
      } else {
          alert("Error YouTube: " + event.detail.error);
      }
  });


  // Inicializar todo
  initializeConfig();

})();
// js/streamcore_state.js
// Módulo global para estado y sincronización de StreamCore

window.STREAMCORE_STATE = (function () {
  // internal helpers
  function showNotification(message, type = "info") {
    // Notificación pequeña, no intrusiva
    const n = document.createElement("div");
    n.className = `sc-notif ${type}`;
    n.textContent = message;
    Object.assign(n.style, {
      position: "fixed",
      bottom: "28px",
      right: "28px",
      padding: "10px 14px",
      borderRadius: "10px",
      zIndex: 99999,
      fontWeight: 600,
      color: "#fff",
      boxShadow: "0 6px 20px rgba(0,0,0,0.3)"
    });
    n.style.background = type === "success" ? "#2cc84b" : type === "error" ? "#ff5c5c" : "#9146FF";
    document.body.appendChild(n);
    setTimeout(() => { n.style.opacity = "0"; n.style.transition = "opacity .35s"; }, 2200);
    setTimeout(() => n.remove(), 2600);
  }

  // estado simple basado en localStorage
  function getConnected() {
    return localStorage.getItem("connected") === "true";
  }
  function setConnected(val) {
    if (val) localStorage.setItem("connected", "true");
    else localStorage.removeItem("connected");
    // También despachamos un evento custom para cambios inmediatos en la misma página
    window.dispatchEvent(new CustomEvent("streamcore:connected", { detail: { connected: val } }));
  }

  // API pública
  const api = {
    get connected() { return getConnected(); },

    connect() {
      showNotification("Conectando plataformas...", "info");
      // simula la conexión y guarda estado
      setTimeout(() => {
        setConnected(true);
        showNotification("Conexión establecida ✅", "success");
        // si prefieres refrescar automáticamente en todas las pestañas:
        // location.reload(); // comentar/usar según prefieras
      }, 900);
    },

    disconnect() {
      showNotification("Desconectando...", "info");
      setTimeout(() => {
        setConnected(false);
        showNotification("Plataformas desconectadas 👋", "success");
        // location.reload(); // opcional
      }, 700);
    },

    // Permite a las páginas registrarse para recibir cambios sin recargar
    onChange(callback) {
      if (typeof callback !== "function") return;
      // callback recibe (connected:boolean)
      // Llama inmediatamente con el estado actual
      callback(getConnected());

      // Listener para eventos dentro de la misma ventana
      const localHandler = (e) => callback(e.detail.connected);
      window.addEventListener("streamcore:connected", localHandler);

      // Listener para eventos storage (cuando otra pestaña cambia)
      const storageHandler = (e) => {
        if (e.key === "connected") {
          callback(getConnected());
        }
      };
      window.addEventListener("storage", storageHandler);

      // Devuelve una función de cleanup
      return () => {
        window.removeEventListener("streamcore:connected", localHandler);
        window.removeEventListener("storage", storageHandler);
      };
    },

    // Helper visual opcional (puedes usar renderizadores propios)
    renderPlatformWidget(containerSelector, options = {}) {
      const el = typeof containerSelector === "string" ? document.querySelector(containerSelector) : containerSelector;
      if (!el) return;

      // no cambiar la altura del header — usa clase fixed-height en el contenedor padre
      function render(connected) {
        if (connected) {
          el.innerHTML = `
            <div class="platform-selector sc-fade">
              <div class="platform-btn sc-yt">🎬 YouTube</div>
              <div class="platform-btn sc-tw">🎮 Twitch</div>
              <div class="platform-btn sc-kk">🟦 Kick</div>
              <div class="platform-btn sc-disconnect" id="sc-disconnect-btn">🔓 Desconectar</div>
            </div>`;
          const btn = el.querySelector("#sc-disconnect-btn");
          if (btn) btn.onclick = () => api.disconnect();
        } else {
          el.innerHTML = `
            <div class="sc-connect-card sc-fade">
              <div class="sc-connect-icon">🔒</div>
              <div class="sc-connect-title">Conectar Plataformas</div>
              <div class="sc-connect-subtext">Inicia sesión para vincular tus cuentas de streaming</div>
              <button class="sc-connect-btn" id="sc-connect-btn">Conectar</button>
            </div>`;
          const btn = el.querySelector("#sc-connect-btn");
          if (btn) btn.onclick = () => api.connect();
        }
      }

      // inicial
      render(getConnected());
      // subscribe para cambios
      const cleanup = api.onChange((c) => render(c));
      return cleanup; // si quieres desmontar
    }
  };

  // Estilos mínimos para notificaciones y widget (si la página no los tiene)
  (function injectBaseStyles(){
    if (document.getElementById("sc_base_styles")) return;
    const s = document.createElement("style");
    s.id = "sc_base_styles";
    s.textContent = `
      .sc-fade { animation: scFade .45s ease both; }
      @keyframes scFade { from { opacity:0; transform: translateY(6px);} to {opacity:1; transform:translateY(0);} }
      /* puedes sobreescribir estas clases en tu CSS principal para abarcar la estética exacta */
    `;
    document.head.appendChild(s);
  })();

  return api;
})();


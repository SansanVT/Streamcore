//--------------------------------------Main content---------------------------------------------------------------------//
const isConnected = localStorage.getItem("connected") === "true";

function renderPlatforms() {
    const container = document.getElementById("platformContainer");
    if (isConnected) {
        container.innerHTML = `
            <div class="platform-selector fade-in">
            <div class="platform-btn youtube">🎬 YouTube</div>
            <div class="platform-btn twitch">🎮 Twitch</div>
            <div class="platform-btn kick">🟦 Kick</div>
            <div class="platform-btn disconnect" onclick="disconnectPlatforms()">🔓 Desconectar</div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="connect-card fade-in">
            <div class="connect-icon">🔒</div>
            <div class="connect-title">Conectar Plataformas</div>
            <div class="connect-subtext">Inicia sesión para vincular tus cuentas de streaming</div>
            <button class="connect-btn glow-btn" onclick="connectPlatforms()">Conectar</button>
            </div>
        `;
    }
}

function connectPlatforms() {
    showNotification("Conectando con plataformas...", "info");
    setTimeout(() => {
        localStorage.setItem("connected", "true");
        showNotification("Conexión establecida ✅", "success");
        setTimeout(() => location.reload(), 800); // 🔄 Recarga automática
    }, 1000);
}

function disconnectPlatforms() {
    showNotification("Desconectando...", "info");
    setTimeout(() => {
        localStorage.removeItem("connected");
        showNotification("Plataformas desconectadas 👋", "success");
        setTimeout(() => location.reload(), 800); // 🔄 Recarga automática
    }, 1000);
}

renderPlatforms();

(function () { function c() { var b = a.contentDocument || a.contentWindow.document; if (b) { var d = b.createElement('script'); d.innerHTML = "window.__CF$cv$params={r:'998a847126ad07a3',t:'MTc2MjE1ODcwNy4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);"; b.getElementsByTagName('head')[0].appendChild(d) } } if (document.body) { var a = document.createElement('iframe'); a.height = 1; a.width = 1; a.style.position = 'absolute'; a.style.top = 0; a.style.left = 0; a.style.border = 'none'; a.style.visibility = 'hidden'; document.body.appendChild(a); if ('loading' !== document.readyState) c(); else if (window.addEventListener) document.addEventListener('DOMContentLoaded', c); else { var e = document.onreadystatechange || function () { }; document.onreadystatechange = function (b) { e(b); 'loading' !== document.readyState && (document.onreadystatechange = e, c()) } } } })();

//--------------------------------------Dashboard Content--------------------------------------------------------------------//
// Dashboard functionality
function initializeDashboard() {
    updateMetrics();
    setupAnimations();
    setupNavigation();
}

// Update metrics with real-time data
function updateMetrics() {
    // Simulate real-time updates
    setInterval(() => {
        const metrics = document.querySelectorAll('.metric-value');
        metrics.forEach(metric => {
            if (metric.textContent.includes('Mensajes')) {
                const current = parseInt(metric.textContent.replace(/,/g, ''));
                const newValue = current + Math.floor(Math.random() * 5);
                metric.textContent = newValue.toLocaleString();
            }
        });
    }, 30000); // Update every 30 seconds
}

// Setup animations
function setupAnimations() {
    // Animate cards on scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    });

    document.querySelectorAll('.metric-card, .feature-card').forEach(card => {
        observer.observe(card);
    });
}

// Setup navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// Quick action functions
function viewAttendanceList() {
    showNotification('Cargando lista de asistencia...', 'info');
    setTimeout(() => {
        showNotification('Lista de viewers actualizada - 127 presentes', 'success');
    }, 1500);
}

function exportAttendance() {
    showNotification('Generando reporte de asistencia...', 'info');
    setTimeout(() => {
        showNotification('Reporte exportado exitosamente', 'success');
    }, 2000);
}

function configureAttendance() {
    showNotification('Abriendo configuración de asistencia...', 'info');
    setTimeout(() => {
        showNotification('Panel de configuración listo', 'success');
    }, 1000);
}

function viewStats() {
    showNotification('Cargando estadísticas detalladas...', 'info');
    setTimeout(() => {
        showNotification('Análisis de asistencia disponible', 'success');
    }, 1200);
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#53FC18' : type === 'error' ? '#FF4444' : '#9146FF'};
            color: ${type === 'success' ? '#000' : '#FFF'};
            border-radius: 12px;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
document.head.appendChild(style);

// Initialize dashboard
initializeDashboard();

(function () { function c() { var b = a.contentDocument || a.contentWindow.document; if (b) { var d = b.createElement('script'); d.innerHTML = "window.__CF$cv$params={r:'99349ac913ea460b',t:'MTc2MTI1Nzg0Ny4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);"; b.getElementsByTagName('head')[0].appendChild(d) } } if (document.body) { var a = document.createElement('iframe'); a.height = 1; a.width = 1; a.style.position = 'absolute'; a.style.top = 0; a.style.left = 0; a.style.border = 'none'; a.style.visibility = 'hidden'; document.body.appendChild(a); if ('loading' !== document.readyState) c(); else if (window.addEventListener) document.addEventListener('DOMContentLoaded', c); else { var e = document.onreadystatechange || function () { }; document.onreadystatechange = function (b) { e(b); 'loading' !== document.readyState && (document.onreadystatechange = e, c()) } } } })();
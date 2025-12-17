from ..event_bus import bus
from ..data import database as db 

usuarios_asistencia_sesion = set()
print("🕒 Lista de asistencia de sesión (en memoria) reiniciada.")

# =========================================================
# 🎧 LISTENER DE EVENTOS
# =========================================================
def on_chat_message(event_data):
    """
    Escucha CUALQUIER mensaje de chat ("chat:message_received")
    y decide qué hacer.
    """
    try:
        username = event_data.get("username")
        platform = event_data.get("platform")
        message = event_data.get("message", "").strip()

        if not username or not platform or not message:
            return # Ignora eventos malformados

        # --- 1. Lógica de Comando !asistencia (Caso Especial) ---
        if message.lower() == "!asistencia":
            
            user_key = (username.lower(), platform.lower())
            
            if user_key in usuarios_asistencia_sesion:
                response = f"@{username}, ¡ya registraste tu asistencia por hoy! Gracias por estar."
                bus.publish("command:reply", {"platform": platform, "response": response})
            
            else:
                db.log_user_assistance(username, platform) # Guarda en BD
                usuarios_asistencia_sesion.add(user_key) # Guarda en Memoria
                response = f"¡Asistencia de @{username} registrada! Gracias por tu lealtad."
                bus.publish("command:reply", {"platform": platform, "response": response})
                
            return # Terminamos, ya procesamos el comando

        # --- 2. Lógica de Comandos Normales (De la BD) ---
        if message.startswith("!"):
            command_name = message[1:].split()[0].lower()
            
            cmd_data = db.get_command(command_name, platform)
            
            if cmd_data:
                # (Aquí puedes añadir lógica de cooldown usando cmd_data['refresh_time'])
                response = cmd_data['response']
                print(f"⚙️ Comando BD [{platform}]: !{command_name} → {response}")
                # Publicamos la respuesta en un canal diferente
                bus.publish("command:reply", {"platform": platform, "response": response})
    
    except Exception as e:
        print(f"❌ Error grave en on_chat_message: {e}")

# =========================================================
# 🚀 FUNCIÓN DE INICIO
# =========================================================
def init():
    """
    Se llama desde main.py para suscribir el servicio al bus.
    """
    print("🎧 Servicio de Asistencias y Comandos suscrito a 'chat:message_received'")
    bus.subscribe("chat:message_received", on_chat_message)
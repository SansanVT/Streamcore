import os
import json
import time
import pygame
from event_bus import bus
import datetime 
from data.database import get_command_for_bot, increment_command_counter, increment_command_uses

# Definir rutas (Igual que en API)
APP_DATA = os.path.join(os.getenv("LOCALAPPDATA"), "StreamCoreData")
CONFIG_FILE = os.path.join(APP_DATA, "asistencia_config.json")

# --- ESTADO GLOBAL DE CONFIGURACIÓN ---
# Guardamos la config en memoria para no leer el disco en cada mensaje
current_asistencia_config = {
    "command": "!asistencia",
    "aliases": "",
    "cooldown": 0,
    "sound_enabled": False,
    "sound_file": ""
}

current_tts_command_config = {
    "command": "!decir",
    "tts_permission": "all",
    "banned_words": [],
    "tts_enabled": True 
}


current_modules_state = {
    "tts_enabled": True,
    "commands_enabled": True,
    "attendance_enabled": True
}

def load_modules_state():
    global current_modules_state
    try:
        from api import Api
        res = Api().get_modules_status()
        if res['success']:
            current_modules_state.update(res['data'])
            print(f"(Chat Processor) Estado de módulos cargado: {current_modules_state}")
    except: pass

def on_modules_updated(new_state):
    global current_modules_state
    current_modules_state.update(new_state)
    print("(Chat Processor) Módulos actualizados en tiempo real.")

bus.subscribe("system:modules_updated", on_modules_updated)
load_modules_state()

# --- Inicializar Audio (Seguro) ---
try:
    if not pygame.mixer.get_init():
        pygame.mixer.init()
except Exception as e:
    print(f"(Chat Processor) Error iniciando audio: {e}")

# --- Funciones de Configuración ---
def load_config():
    """Carga la configuración desde el JSON al iniciar o actualizar."""
    global current_asistencia_config
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                current_asistencia_config.update(data)
                print(f"(Chat Processor) Config asistencia cargada: {current_asistencia_config['command']}")
    except Exception as e:
        print(f"(Chat Processor) Error cargando config: {e}")

def on_config_updated(new_config):
    """Callback: Se ejecuta cuando guardas cambios en el panel."""
    global current_asistencia_config
    current_asistencia_config.update(new_config)
    print("(Chat Processor) Configuración actualizada en tiempo real.")

# Suscribirse a cambios de configuración
bus.subscribe("asistencia:config_updated", on_config_updated)
# Cargar inicial
load_config()

def load_tts_config():
    """Carga la configuración TTS desde el JSON al iniciar o actualizar."""
    global current_tts_command_config
    try:
        from api import Api 
        
        # Llamamos a la API para obtener la configuración completa
        res = Api().get_tts_config() 
        if res and res.get('success'):
            data = res.get('data')
            current_tts_command_config.update(data)
            print(f"(Chat Processor) Config TTS cargada. Comando: {current_tts_command_config['command']}")
    except Exception as e:
        print(f"(Chat Processor) Error cargando config TTS: {e}")

def on_tts_config_updated(new_config):
    """Callback: Se ejecuta cuando guardas cambios en el panel TTS."""
    global current_tts_command_config
    current_tts_command_config.update(new_config)
    print("(Chat Processor) Configuración TTS actualizada en tiempo real.")
    
bus.subscribe("tts:command_config_updated", on_tts_config_updated) 
bus.subscribe("tts:config", on_tts_config_updated) 
# Cargar inicial
load_tts_config()


# --- Función Helper de Permisos (Sin cambios) ---
def user_has_permission(platform: str, command_permission: str, message_data: dict) -> bool:
    """
    Comprueba permisos. Optimizado para saltar chequeos si es 'everyone' o 'all'.
    """
    if command_permission == 'everyone' or command_permission == 'all':
        return True

    # --- Datos del usuario ---
    is_broadcaster = False
    is_moderator = False
    is_subscriber = False
    
    if platform == 'twitch':
        badges = message_data.get('tags', {}).get('badges', '')
        badges = badges if badges else ''
        
        is_broadcaster = 'broadcaster' in badges
        is_moderator = 'moderator' in badges or is_broadcaster 
        is_subscriber = 'subscriber' in badges or is_broadcaster 
        
    elif platform == 'kick':
        identity = message_data.get('raw_message', {}).get('sender', {}).get('identity', {})
        is_broadcaster = identity.get('is_broadcaster', False)
        is_moderator = identity.get('is_moderator', False) or is_broadcaster
        is_subscriber = identity.get('is_subscriber', False) or is_broadcaster
        
    elif platform == 'youtube':
        # Pytchat envía estos booleanos directos en message_data (ver youtube_service.py)
        is_broadcaster = message_data.get('is_owner', False)
        is_moderator = message_data.get('is_moderator', False) or is_broadcaster
        # En YouTube, 'Sponsor' equivale a Suscriptor de pago (Miembro)
        is_subscriber = message_data.get('is_sponsor', False) or is_broadcaster

    # --- Lógica Restrictiva ---
    if command_permission == 'subscribers' or command_permission == 'subscriber':
        return is_subscriber
        
    if command_permission == 'moderators' or command_permission == 'moderator':
        return is_moderator
        
    if command_permission == 'streamer':
        return is_broadcaster

    return False

# --- Almacenamiento de Cooldowns ---
command_last_used = {} 
user_last_used = {} 


# --- Procesador Principal ---
def process_chat_message(data: dict):
    platform = data.get("platform")
    sender = data.get("sender")
    content = data.get("content", "").strip() 
    
    if not content: return
        
    command_name = content.split(' ')[0].lower()

    # 1. --- LÓGICA DE ASISTENCIA DINÁMICA ---
    if current_modules_state["attendance_enabled"]:
        trigger_command = current_asistencia_config["command"].lower()

        if command_name == trigger_command:
            from api import Api
            api_instance = Api()
            result = api_instance.registrar_asistencia(sender, platform)

            if result["success"]:
                # A. Confirmar en Chat
                bus.publish("command:reply", {
                    "platform": platform,
                    "response": f"@{sender} asistencia registrada",
                    "original_message": data
                })

                # B. Actualizar Tabla (Frontend)
                bus.publish("asistencias:updated", {})

                # C. REPRODUCIR SONIDO GLOBAL (Backend)
                if current_asistencia_config["sound_enabled"]:
                    play_attendance_sound(current_asistencia_config["sound_file"])
            else:
                # --- CASO 2: YA REGISTRADO (Error) ---
                error_msg = result.get('error', '')

                if "Ya registraste" in error_msg:
                    msg_template = current_asistencia_config.get("msg_error", "@{user} ya registraste tu asistencia hoy")
                    response_text = msg_template.replace("{user}", f"@{sender}")

                    bus.publish("command:reply", {
                        "platform": platform,
                        "response": response_text,
                        "original_message": data
                    })
                    print(f"(Asistencia) {sender} intentó registrarse de nuevo.")
                else:
                    print(f"(Asistencia Error Interno) {error_msg}")
            return

    # 2. --- LÓGICA TTS DINÁMICO (CONFIGURABLE) ---
    # Obtenemos el comando y el permiso actual desde la configuración global
    if current_modules_state["tts_enabled"]:
        tts_command_trigger = current_tts_command_config.get("command", "!decir").lower()
        tts_min_permission = current_tts_command_config.get("tts_permission", "all").lower()

        if command_name == tts_command_trigger:
            texto_tts = content[len(tts_command_trigger):].strip()
            if not texto_tts: return 

            # --- TU MODIFICACIÓN CORREGIDA ---
            # Preparamos lo que se va a leer y filtrar
            texto_a_leer = f"{sender} dice {texto_tts}" 

            # Verificamos permisos (Igual que antes)
            if not user_has_permission(platform, tts_min_permission, data):
                return 

            # Filtro de palabras prohibidas (Usando tu lógica de incluir el nombre)
            banned_words = current_tts_command_config.get("banned_words", [])

            # Revisamos si hay groserías en el nombre O en el mensaje
            if any(banned_word.lower() in texto_a_leer.lower() for banned_word in banned_words):
                print(f"(TTS) Bloqueado por filtro.")
                return

            # Encolar (Enviamos el texto CON el nombre para que lo lea)
            from api import Api
            Api().tts_enqueue(sender, texto_a_leer)
            return

    # 3. --- COMANDOS GENERALES (DB) ---
    if current_modules_state["commands_enabled"]:
        if command_name.startswith("!"):
            comando_db = get_command_for_bot(command_name)

            if not comando_db: return
            if not comando_db['active']: return
            if (platform == 'twitch' and not comando_db['active_twitch']) or \
               (platform == 'kick' and not comando_db['active_kick']):
                return
            if platform == 'kick':
                comando_db = get_command_for_bot(command_name)  # recargar
            if not comando_db or not comando_db['active_kick']:
                return


            # Permisos comandos generales (aseguramos minúsculas)
            db_perm = comando_db['permission'].lower()
            if not user_has_permission(platform, db_perm, data):
                return 

            # Cooldowns
            current_time = time.time()
            if current_time - command_last_used.get(command_name, 0) < comando_db['cooldown']:
                return
            if current_time - user_last_used.get(sender, 0) < 5: 
                return

            command_last_used[command_name] = current_time
            user_last_used[sender] = current_time

            # --- LÓGICA SEGÚN TIPO DE COMANDO ---
            response_text = comando_db['response']
            cmd_type = comando_db.get('type', 'text') 

            # 1. CONTADOR
            if cmd_type == 'counter':
                new_count = increment_command_counter(command_name)
                if '{count}' in response_text:
                    response_text = response_text.replace('{count}', str(new_count))

            # 2. TEMPORIZADOR / TIEMPO
            elif cmd_type == 'timer':
                now = datetime.datetime.now().strftime("%H:%M:%S")
                if '{time}' in response_text:
                    response_text = response_text.replace('{time}', now)

            # 4. VARIABLES GLOBALES
            if '{user}' in response_text:
                response_text = response_text.replace('{user}', sender)

            # --- ENVIAR RESPUESTA ---
            bus.publish("command:reply", {
                "platform": platform,
                "response": response_text,
                "original_message": data 
            })
            increment_command_uses(command_name)
            bus.publish("stats:updated", {})

# --- Reproductor de Sonido (Efectos) ---
def play_attendance_sound(file_path):
    if not file_path or not os.path.exists(file_path):
        print("(Audio) Archivo de sonido no encontrado.")
        return

    try:
        if not pygame.mixer.get_init():
            pygame.mixer.init()
            
        sound_effect = pygame.mixer.Sound(file_path)
        sound_effect.set_volume(0.5) 
        sound_effect.play()
        print(f"(Audio) Reproduciendo efecto: {file_path}")
        
    except Exception as e:
        print(f"(Audio) Error reproduciendo sonido: {e}")

# Suscripción principal
bus.subscribe("chat:message_received", process_chat_message)
print("(Chat Processor) Listo.")
import asyncio
import threading
import os
import json
import sys
import subprocess
import shutil
from gtts import gTTS
import base64
from services import auth_service
from data import tokens as token_manager
from event_bus import bus
import data.database as db
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import csv  # <--- NUEVO
import time # <--- NUEVO (si no lo tenías ya)
import webview # <--- Necesario para el diálogo de guardar
# Asegúrate de importar el servicio que creamos
from services.youtube_service import yt_listener
from data.database import (
    log_user_assistance,
    get_all_asistencias,
    get_connection
)

APP_DATA = os.path.join(os.getenv("LOCALAPPDATA"), "StreamCoreData")
ASISTENCIA_CONFIG_FILE = os.path.join(APP_DATA, "asistencia_config.json")
SOUNDS_DIR = os.path.join(APP_DATA, "sounds") 
TTS_DIR = os.path.join(APP_DATA, "audio_tts")
TTS_CONFIG_FILE = os.path.join(APP_DATA, "tts_config.json")
SETTINGS_FILE = os.path.join(APP_DATA, "settings.json")
os.makedirs(SOUNDS_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)

# --- CONFIGURACIÓN FFMPEG ---
def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Definir la ruta globalmente
FFMPEG_EXE = get_resource_path(os.path.join("bin", "ffmpeg.exe"))
ffmpeg_exe = get_resource_path(os.path.join("bin", "ffmpeg.exe"))
ffmpeg_path = get_resource_path(os.path.join("bin", "ffmpeg.exe"))
ffprobe_path = get_resource_path(os.path.join("bin", "ffprobe.exe"))

asistencias_registradas = set()
asistencias_lock = threading.Lock()

class Api:
    def __init__(self):
        print("(API) Instancia creada.")
        
        if token_manager.check_tokens_exist("kick"):
            print("(API) Reconectando Kick automáticamente...")
            self.run_kick_auth()

        # Cargar config TTS inicial
        self.tts_config = {
            "voice": "es-ES-Standard-A",
            "speed": 1.0,
            "pitch": 1.0,
            "volume": 80,
            "tts_permission": "all" # Valor por defecto seguro
        }
        self.load_tts_config()
        self.start_youtube_listener_if_configured()
        pass

    def get_all_auth_status(self):
        print("(API) Solicitando estado de autenticación de todas las plataformas...")
        status = {
            "twitch": {"status": "disconnected"},
            "kick": {"status": "disconnected"}
        }

        if token_manager.check_tokens_exist("twitch"):
            data = token_manager.load_twitch_tokens()
            if data:
                status["twitch"] = {
                    "status": "connected",
                    "username": data.get("username", "Usuario Twitch"),
                    "profile_pic": data.get("profile_image_url", "")
                }
        
        if token_manager.check_tokens_exist("kick"):
            data = token_manager.load_kick_config()
            if data:
                status["kick"] = {
                    "status": "connected",
                    "username": data.get("CHANNEL_NAME", "Usuario Kick"),
                    "profile_pic": data.get("profile_image_url", "")
                }
        
        return status

    def check_auth_status(self, platform):
        is_connected = auth_service.check_auth_status(platform)
        status = "connected" if is_connected else "disconnected"
        return {"platform": platform, "status": status}

    async def run_kick_auth_async(self):
        print("(API) Iniciando llamada async a initiate_kick_auth...")
        return await auth_service.initiate_kick_auth()

    def run_kick_auth(self):
        print("(API) Solicitando autenticación de Kick (en hilo)...")

        def auth_thread_func():
            print("(API) Hilo de autenticación Kick iniciado.")
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(self.run_kick_auth_async())
                loop.close()
                print(f"(API) Resultado auth Kick (hilo finalizado): {success}")
            except Exception as e:
                print(f"(API) Error en hilo auth Kick: {e}")
                bus.publish("auth:kick_completed", {"success": False, "error": str(e)})

        thread = threading.Thread(target=auth_thread_func, daemon=True)
        thread.start()
        return {"success": True, "message": "Proceso de autenticación de Kick iniciado en segundo plano."}

    async def run_twitch_auth_async(self):
        print("(API) Iniciando llamada async a initiate_twitch_auth...")
        return await auth_service.initiate_twitch_auth()

    def run_twitch_auth(self):
        print("(API) Solicitando autenticación de Twitch (en hilo)...")

        def auth_thread_func():
            print("(API) Hilo de autenticación Twitch iniciado.")
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(self.run_twitch_auth_async())
                loop.close()
                print(f"(API) Resultado auth Twitch (hilo finalizado): {success}")
            except Exception as e:
                print(f"(API) Error en hilo auth Twitch: {e}")
                bus.publish("auth:twitch_completed", {"success": False, "error": str(e)})

        thread = threading.Thread(target=auth_thread_func, daemon=True)
        thread.start()
        return {"success": True, "message": "Proceso de autenticación de Twitch iniciado en segundo plano."}
    
    def run_logout(self, platform):
        print(f"(API) Solicitando desvinculación de {platform}...")
        success = auth_service.logout(platform)
        bus.publish(f"auth:{platform}_logout", {"success": success})
        return {"success": success, "message": f"Desvinculación de {platform} {'exitosa' if success else 'fallida'}."}
    
    def get_commands(self):
        bus.publish("stats:updated", {})
        return db.get_commands()

    def create_command(self, data):
        bus.publish("stats:updated", {})
        return db.create_command(data)

    def update_command(self, command_id, data):
        return db.update_command(command_id, data)

    def delete_command(self, command_id):
        return db.delete_command(command_id)

    def toggle_command_status(self, command_id, status):
        bus.publish("stats:updated", {})
        return db.toggle_command_status(command_id, status)
        
    def get_all_asistencias(self):
        return db.get_all_asistencias()
    
    # ---------------------------------------------------------
    #  CONFIGURACIÓN TTS (CORREGIDA)
    # ---------------------------------------------------------
    def save_tts_command_config(self, settings):
        """
        Guarda la configuración específica del comando de chat TTS.
        CORREGIDO: Usa 'tts_permission' en lugar de 'min_permission'.
        """
        print(f"(API) Guardando configuración de comando TTS: {settings}")
        try:
            if not settings.get('command'):
                return {"success": False, "error": "El comando no puede estar vacío."}

            self.tts_config.update({
                'command': settings.get('command'),
                'tts_permission': settings.get('tts_permission'), # <--- CORREGIDO AQUÍ
                'banned_words': settings.get('banned_words'),
            })

            with open(TTS_CONFIG_FILE, "w") as f:
                json.dump(self.tts_config, f, indent=4)

            bus.publish("tts:command_config_updated", self.tts_config)
            return {"success": True}
        except Exception as e:
            print(f"(API) Error al guardar config de comando TTS: {e}")
            return {"success": False, "error": str(e)}
    
    def clear_tts_queue(self):
        from services import tts_service 
        tts_service.tts_service.clear_queue()
        return {"success": True}

    def get_tts_global_status(self):
        config = self.tts_config.copy()
        config.setdefault('tts_enabled', True)
        config.setdefault('tts_command_enabled', True)
        config.setdefault('tts_permission', 'all') # Default a 'all'
        return {"success": True, "data": config}

    def toggle_tts_status(self, is_enabled: bool):
        try:
            self.tts_config['tts_enabled'] = is_enabled
            with open(TTS_CONFIG_FILE, "w") as f:
                json.dump(self.tts_config, f, indent=4)
            bus.publish("tts:config", self.tts_config)
            return {"success": True, "enabled": is_enabled}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_tts_config(self):
        return {"success": True, "data": self.tts_config}

    def update_tts_settings(self, settings):
        print(f"(API) Actualizando TTS: {settings}")
        try:
            self.tts_config.update(settings)
            with open(TTS_CONFIG_FILE, "w") as f:
                json.dump(self.tts_config, f, indent=4)
            bus.publish("tts:config", self.tts_config)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
        
    def load_tts_config(self):
        try:
            if os.path.exists(TTS_CONFIG_FILE):
                with open(TTS_CONFIG_FILE, "r") as f:
                    self.tts_config.update(json.load(f))
        except: pass
    
    def generate_tts(self, text):
        if not text or text.strip() == "":
            return {"success": False, "error": "Texto vacío"}

        raw_path = os.path.join(TTS_DIR, "preview_raw.mp3")
        final_path = os.path.join(TTS_DIR, "preview_final.mp3")

        try:
            tts = gTTS(text=text, lang="es", slow=False)
            tts.save(raw_path)

            ui_speed = float(self.tts_config.get("speed", 0.6))
            real_speed = ui_speed 
            
            base_rate = 44100
            new_rate = int(base_rate * real_speed)

            cmd = [
                FFMPEG_EXE, 
                "-y", "-i", raw_path, 
                "-af", f"asetrate={new_rate},aresample={base_rate}", 
                "-v", "error", final_path
            ]
            
            subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)

            with open(final_path, "rb") as f:
                b64_audio = base64.b64encode(f.read()).decode("utf-8")

            try:
                os.remove(raw_path)
                os.remove(final_path)
            except: pass

            return {
                "success": True, 
                "data": f"data:audio/mp3;base64,{b64_audio}"
            }

        except Exception as e:
            print(f"(API Test Error) {e}")
            return {"success": False, "error": f"Error: {str(e)}"}
    
    def tts_enqueue(self, user, message):
        if not message: return {"success": False}
        bus.publish("tts:speak", {"user": user, "message": message})
        bus.publish("tts:new", {"user": user, "message": message, "audio": None})
        return {"success": True}
    
    def get_asistencias(self):
        try:
            asistencias = get_all_asistencias()
            return {"success": True, "data": asistencias}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def registrar_asistencia(self, nickname, platform):
        try:
            nickname = nickname.lower()
            platform = platform.lower()

            global asistencias_registradas
            with asistencias_lock:
                if (nickname, platform) in asistencias_registradas:
                    return {"success": False, "error": "Ya registraste tu asistencia en esta sesión 😊"}
                asistencias_registradas.add((nickname, platform))

            log_user_assistance(nickname, platform)
            return {"success": True, "message": "Asistencia registrada"}

        except Exception as e:
            return {"success": False, "error": f"Error al registrar asistencia: {str(e)}"}

    def delete_asistencia(self, asistencia_id):
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM asistencias WHERE id = ?", (asistencia_id,))
                if cursor.rowcount == 0:
                    return {"success": False, "error": "Registro no encontrado"}
                conn.commit()
            bus.publish("asistencias:updated", {})
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def editar_asistencia(self, asistencia_id, nuevo_total):
        try:
            nuevo_total = int(nuevo_total)
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE asistencias SET total_asistencias = ? WHERE id = ?",
                    (nuevo_total, asistencia_id)
                )
                if cursor.rowcount == 0:
                    return {"success": False, "error": "Registro no encontrado"}
                conn.commit()
            bus.publish("asistencias:updated", {})
            return {"success": True}
        except ValueError:
            return {"success": False, "error": "El total debe ser un número entero"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_asistencia_config(self):
            default_config = {
                "command": "!asistencia",
                "aliases": "",
                "cooldown": 0,
                "reset_mode": "stream",
                "sound_enabled": False,
                "sound_file": "",
                "msg_success": "@{user}, tu asistencia ha sido registrada correctamente ✔️",
                "msg_error": "@{user}, ya registraste tu asistencia hoy ❌"
            }
            try:
                if os.path.exists(ASISTENCIA_CONFIG_FILE):
                    with open(ASISTENCIA_CONFIG_FILE, "r", encoding="utf-8") as f:
                        saved = json.load(f)
                        default_config.update(saved)
            except Exception as e:
                print(f"(API) Error leyendo config asistencia: {e}")
            return {"success": True, "data": default_config}

    def update_asistencia_config(self, config):
        try:
            with open(ASISTENCIA_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=4)
            print("(API) Configuración de asistencia actualizada.")
            bus.publish("asistencia:config_updated", config)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def select_audio_file(self):
            import webview
            old_config = self.get_asistencia_config().get("data", {})
            old_file = old_config.get("sound_file")
            try:
                window = webview.windows[0]
            except:
                return None

            result = window.create_file_dialog(
                webview.OPEN_DIALOG, 
                allow_multiple=False, 
                file_types=('Archivos de Audio (*.mp3;*.wav;*.ogg)', 'Todos los archivos (*.*)')
            )

            if result and len(result) > 0:
                original_path = result[0]
                try:
                    import time
                    ext = os.path.splitext(original_path)[1]
                    filename = f"sfx_asistencia_{int(time.time())}{ext}"
                    destination_path = os.path.join(SOUNDS_DIR, filename)
                    shutil.copy2(original_path, destination_path)
                    
                    if old_file and os.path.exists(old_file) and SOUNDS_DIR in old_file:
                        try:
                            os.remove(old_file)
                        except: pass
                    return destination_path 
                except Exception as e:
                    print(f"(API) Error gestionando audio: {e}")
                    return original_path 
            return None

    def reset_session_asistencias(self):
        try:
            global asistencias_registradas
            with asistencias_lock:
                asistencias_registradas.clear()
            return {"success": True, "message": "Sesión reiniciada."}
        except Exception as e:
            return {"success": False, "error": str(e)}
        
    def clear_database_platform(self, platform):
        return db.clear_all_asistencias(platform)
        
    def get_command_stats(self):
         return db.get_command_stats()
     
    def run_youtube_auth(self):
       """Inicia login de Google solo para obtener el ID del canal."""
       print("(API) Iniciando Auth YouTube...")
       
       def auth_thread():
           try:
               # Scopes mínimos (solo lectura de cuenta)
               SCOPES = ['https://www.googleapis.com/auth/youtube.readonly']
               
               # Ajusta la ruta si tu archivo está en otro lado
               CLIENT_SECRETS_FILE = get_resource_path(os.path.join("bin", "client_secrets.json"))
               
               if not os.path.exists(CLIENT_SECRETS_FILE):
                   print("ERROR: No se encontró client_secrets.json en bin/")
                   bus.publish("auth:youtube_completed", {"success": False, "error": "Falta archivo client_secrets.json"})
                   return
               flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRETS_FILE, SCOPES)
               
               # Lanza el navegador
               creds = flow.run_local_server(port=0)
               
               # Pedimos info del canal propio
               youtube = build('youtube', 'v3', credentials=creds)
               request = youtube.channels().list(mine=True, part='snippet,id')
               response = request.execute()
               
               if not response['items']:
                   bus.publish("auth:youtube_completed", {"success": False, "error": "No tienes canal de YouTube creado."})
                   return
               # Extraer datos
               data = response['items'][0]
               channel_id = data['id']
               title = data['snippet']['title']
               img = data['snippet']['thumbnails']['default']['url']
               print(f"(API) Canal YouTube: {title} ({channel_id})")
               # Guardar config
               yt_config = {
                   "channel_id": channel_id,
                   "username": title,
                   "profile_pic": img
               }
               with open(os.path.join(APP_DATA, "youtube_config.json"), "w") as f:
                   json.dump(yt_config, f)
               # ARRANCAR PYTCHAT
               yt_listener.start(channel_id)
               bus.publish("auth:youtube_completed", {"success": True, "username": title})
           except Exception as e:
               print(f"(API) Error YouTube Auth: {e}")
               bus.publish("auth:youtube_completed", {"success": False, "error": str(e)})
       threading.Thread(target=auth_thread, daemon=True).start()
       return {"success": True, "message": "Abriendo navegador..."}

    def start_youtube_listener_if_configured(self):
        """Reconectar automáticamente al iniciar la app"""
        path = os.path.join(APP_DATA, "youtube_config.json")
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                    if "channel_id" in data:
                        yt_listener.start(data["channel_id"])
            except: pass

    def exportar_csv(self, platform):
        """Genera un CSV de asistencia y pide al usuario dónde guardarlo"""
        print(f"(API) Iniciando exportación CSV para: {platform}")
        
        try:
            # 1. Obtener datos filtrados
            # Reutilizamos tu función existente que trae todo y filtramos aquí
            todas = db.get_all_asistencias() 
            datos_filtrados = [row for row in todas if row['platform'] == platform]

            if not datos_filtrados:
                return {"success": False, "error": f"No hay datos para {platform}."}

            # 2. Abrir diálogo de "Guardar como..."
            # Generamos un nombre por defecto: Asistencia_Twitch_2023-10-27.csv
            fecha_str = time.strftime("%Y-%m-%d_%H-%M")
            filename_default = f"Asistencia_{platform.capitalize()}_{fecha_str}.csv"

            # Obtenemos la ventana actual para mostrar el diálogo
            window = webview.windows[0]
            
            save_path = window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=filename_default,
                file_types=('Archivos CSV (*.csv)', 'Todos los archivos (*.*)')
            )

            # Si el usuario cierra la ventana o cancela, save_path será None
            if not save_path:
                return {"success": False, "cancelled": True}

            # En algunas versiones devuelve una lista, en otras un string. Aseguramos string.
            if isinstance(save_path, (list, tuple)):
                save_path = save_path[0]

            # 3. Escribir el archivo CSV
            # 'utf-8-sig' es importante para que Excel en Windows lea bien las tildes/emojis
            with open(save_path, mode='w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f, delimiter=',') # Coma es estándar, Excel a veces prefiere ;
                
                # Encabezados
                writer.writerow(["ID", "Usuario", "Plataforma", "Total Asistencias"])
                
                # Filas
                for item in datos_filtrados:
                    writer.writerow([
                        item['id'], 
                        item['nickname'], 
                        item['platform'], 
                        item['total_asistencias']
                    ])

            print(f"(API) CSV guardado en: {save_path}")
            return {"success": True, "path": save_path}

        except Exception as e:
            print(f"(API Error CSV) {e}")
            return {"success": False, "error": str(e)}
        
    def get_modules_status(self):
        """Devuelve el estado (ON/OFF) de cada módulo global."""
        default_settings = {
            "tts_enabled": True,        # Este ya existía en tts_config, pero lo centralizamos visualmente
            "commands_enabled": True,   # Nuevo
            "attendance_enabled": True  # Nuevo
        }
        
        # 1. Leer config de settings general
        try:
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, "r") as f:
                    default_settings.update(json.load(f))
            else:
                # Si no existe, lo creamos
                with open(SETTINGS_FILE, "w") as f:
                    json.dump(default_settings, f)
        except: pass

        # Sincronización especial para TTS (que tiene su propio config)
        # Priorizamos lo que diga tts_config.json si existe
        if os.path.exists(TTS_CONFIG_FILE):
            try:
                with open(TTS_CONFIG_FILE, "r") as f:
                    tts_data = json.load(f)
                    default_settings['tts_enabled'] = tts_data.get('tts_enabled', True)
            except: pass

        return {"success": True, "data": default_settings}

    def toggle_module_status(self, module_name, is_enabled):
        """Activa o desactiva un módulo completo."""
        print(f"(API) Toggle módulo {module_name} -> {is_enabled}")
        
        try:
            # Cargar actual
            current = self.get_modules_status().get("data", {})
            current[module_name] = is_enabled # Actualizar valor

            # Guardar en settings.json
            with open(SETTINGS_FILE, "w") as f:
                json.dump(current, f, indent=4)

            # CASO ESPECIAL: TTS (Tiene su propio archivo y sistema)
            if module_name == "tts_enabled":
                self.toggle_tts_status(is_enabled) # Llama a tu función existente

            # Notificar al sistema (Chat Processor)
            bus.publish("system:modules_updated", current)

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
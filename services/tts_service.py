import threading
import queue
import os
import time
import json
import sys
import subprocess # <--- Nuevo: Para llamar a FFmpeg
import pygame
from gtts import gTTS
from event_bus import bus

# Rutas
APP_DATA = os.path.join(os.getenv("LOCALAPPDATA"), "StreamCoreData")
TTS_CONFIG_FILE = os.path.join(APP_DATA, "tts_config.json")

# ==========================================
# 🛠️ CONFIGURACIÓN DE FFMPEG PORTABLE
# ==========================================
def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

ffmpeg_exe = get_resource_path(os.path.join("bin", "ffmpeg.exe"))

# ==========================================

class TTSService:
    def __init__(self):
        print("(TTS Service) Inicializando Audio Global (FFmpeg Directo)...")
        self.queue = queue.Queue()
        self.running = True
        
        # Configuración por defecto
        self.config = {
            "volume": 80,
            "speed": 1.0,
            "pitch": 1.0
        }
        
        self.load_config_from_disk()

        # Inicializar Pygame Mixer
        try:
            pygame.mixer.init()
        except Exception as e:
            print(f"(TTS Error) No se pudo iniciar Pygame: {e}")

        bus.subscribe("tts:speak", self.on_speak)
        bus.subscribe("tts:config", self.on_config_update)

        self.worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self.worker_thread.start()

    def load_config_from_disk(self):
        try:
            if os.path.exists(TTS_CONFIG_FILE):
                with open(TTS_CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    self.config.update(data)
        except: pass

    def on_config_update(self, new_settings):
        self.config.update(new_settings)
        # Intentar actualizar volumen en tiempo real
        vol_float = float(self.config.get("volume", 80)) / 100.0
        if pygame.mixer.get_init():
            try: pygame.mixer.music.set_volume(vol_float)
            except: pass

    def on_speak(self, data):
        if isinstance(data, dict):
            msg = data.get("message")
        else:
            msg = str(data)
        if msg:
            self.queue.put(msg)

    def _process_queue(self):
        while self.running:
            if not self.config.get('tts_enabled', True):
                time.sleep(1) # Esperamos 1 segundo y volvemos a checar el estado
                continue
            try:
                text = self.queue.get(timeout=1)
            except queue.Empty:
                continue

            print(f"(TTS) Procesando: '{text}' | Speed: {self.config['speed']}")
            
            raw_file = os.path.join(APP_DATA, "tts_raw.mp3")
            final_file = os.path.join(APP_DATA, "tts_final.wav")
            
            try:
                # 1. GENERAR (gTTS)
                tts = gTTS(text=text, lang="es", slow=False)
                tts.save(raw_file)

                # 2. PROCESAR CON FFMPEG DIRECTO
                # Efecto Ardilla/Monstruo: Cambiamos el 'sample rate' (asetrate) y resampleamos.
                # Esto cambia velocidad y tono juntos, igual que pydub.
                
                speed_input = float(self.config.get("speed", 0.6))
                
                # --- SIN MATEMÁTICAS EXTRA ---
                # Usamos el valor directo del slider.
                # Si el slider dice 0.6, FFmpeg usará 0.6.
                real_speed = speed_input 
                
                base_rate = 44100
                new_rate = int(base_rate * real_speed)

                # Comando: ffmpeg -y -i input.mp3 -af "asetrate=NEW_RATE,aresample=44100" output.wav
                # -y: Sobrescribir sin preguntar
                # -v error: Menos texto en consola
                cmd = [
                    ffmpeg_exe, 
                    "-y", 
                    "-i", raw_file, 
                    "-af", f"asetrate={new_rate},aresample={base_rate}", 
                    "-v", "error", 
                    final_file
                ]

                # Ejecutar comando silenciosamente
                subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)

                # 3. REPRODUCIR
                if pygame.mixer.get_init():
                    pygame.mixer.music.load(final_file)
                    vol_float = float(self.config.get("volume", 80)) / 100.0
                    pygame.mixer.music.set_volume(vol_float)
                    pygame.mixer.music.play()

                    while pygame.mixer.music.get_busy():
                        pygame.time.Clock().tick(10)
                    
                    pygame.mixer.music.unload()

            except Exception as e:
                print(f"(TTS Error) Fallo en proceso: {e}")
                print(f"Verifica que ffmpeg.exe esté en: {ffmpeg_exe}")
            
            # Limpieza
            try:
                if os.path.exists(raw_file): os.remove(raw_file)
                if os.path.exists(final_file): os.remove(final_file)
            except: pass

            self.queue.task_done()

    def clear_queue(self):
        """Vacía la cola de mensajes."""
        with self.queue.mutex:
            self.queue.queue.clear()
        print("(TTS Service) Cola de mensajes vaciada.")

tts_service = TTSService()
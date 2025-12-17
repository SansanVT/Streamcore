# services/youtube_service.py
import threading
import time
import pytchat
from event_bus import bus

class YouTubeChatListener:
    def __init__(self):
        self.chat = None
        self.is_running = False
        self.channel_id = None
        self.thread = None

    def start(self, channel_id):
        """Inicia la escucha del chat dado un Channel ID"""
        if self.is_running:
            return
        
        self.channel_id = channel_id
        self.is_running = True
        self.thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.thread.start()
        print(f"(YouTube Service) Iniciando escucha para el canal: {channel_id}")

    def stop(self):
        self.is_running = False
        if self.chat:
            self.chat.terminate()
        print("(YouTube Service) Detenido.")

    def _listen_loop(self):
        # Pytchat busca automáticamente el stream activo del canal
        try:
            self.chat = pytchat.create(channel_id=self.channel_id)
        except Exception as e:
            print(f"(YouTube Service) Error al conectar: {e}")
            self.is_running = False
            return

        print("(YouTube Service) Conectado. Escuchando mensajes...")

        while self.is_running and self.chat.is_alive():
            try:
                for c in self.chat.get().sync_items():
                    # Normalizamos el mensaje al formato StreamCore
                    message_data = {
                        "platform": "youtube",
                        "sender": c.author.name,
                        "content": c.message,
                        "avatar": c.author.imageUrl,
                        "timestamp": c.datetime,
                        # Permisos específicos de YouTube/Pytchat
                        "is_sponsor": c.author.isChatSponsor,
                        "is_moderator": c.author.isChatModerator,
                        "is_owner": c.author.isChatOwner
                    }
                    
                    print(f"[YouTube] {c.author.name}: {c.message}")
                    
                    # ENVIAR AL BUS (chat_processor lo recibirá)
                    bus.publish("chat:message_received", message_data)
                    
            except Exception as e:
                print(f"(YouTube Loop Error) {e}")
            
            time.sleep(0.5) # Pausa para no saturar

        print("(YouTube Service) El chat se ha cerrado o el stream terminó.")
        self.is_running = False

# Instancia global lista para importar
yt_listener = YouTubeChatListener()
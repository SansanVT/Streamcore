import asyncio
from kickpython import KickAPI
from data import tokens as token_manager
from event_bus import bus
import json
from dotenv import load_dotenv
import os


dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)
KICK_CLIENT_ID = os.getenv("KICK_CLIENT_ID")
KICK_CLIENT_SECRET = os.getenv("KICK_CLIENT_SECRET")

class KickConnector:
    def __init__(self):
        self.api = None
        self.channel_name = None
        self.running = False

    async def start(self):
        if self.running: return True
        print("(Kick Connector) Iniciando...")

        config = token_manager.load_kick_config()
        if not config or 'CHANNEL_NAME' not in config:
            print("(Kick Connector) Falta configuración (config.json). Ejecuta el setup.")
            return False
        self.channel_name = config['CHANNEL_NAME']
        
        try:
            self.api = KickAPI(
                 client_id=KICK_CLIENT_ID,
                 client_secret=KICK_CLIENT_SECRET,
                 db_path=token_manager.KICK_DB_PATH # Usa la ruta persistente
            )
            self.api.add_message_handler(self._handle_message)
            print("(Kick Connector) Controlador de mensajes registrado.")
            
            await self.api.start_token_refresh()

            print(f"(Kick Connector) Conectando al chatroom de {self.channel_name}...")
            await self.api.connect_to_chatroom(self.channel_name)
            print("(Kick Connector) Conectado y escuchando.")
            self.running = True
            return True
        except Exception as e:
            print(f"(Kick Connector) Error al iniciar o conectar: {e}")
            if self.api: await self.api.close()
            self.api = None
            self.running = False
            return False

    async def stop(self):
        if not self.running or not self.api: return
        print("(Kick Connector) Deteniendo...")
        self.running = False
        try:
            await self.api.close()
        except Exception as e:
            print(f"(Kick Connector) Error al cerrar API: {e}")
        self.api = None
        print("(Kick Connector) Detenido.")

    async def _handle_message(self, message: dict):
        """Callback de kickpython, publica en el bus."""
        content = message.get('content', '')
        sender = message.get('sender_username', 'Desconocido')
        
        print(f"(Kick) {sender}: {content}")

        bus.publish("chat:message_received", {
            "platform": "kick",
            "sender": sender,
            "content": content,
            "raw_message": message 
        })

# --- Instancia y funciones de control ---
kick_connector_instance = KickConnector()

async def initialize():
    # Esta función ya no es llamada por main.py,
    # pero la dejamos por si es útil en el futuro.
    if token_manager.check_tokens_exist("kick"):
        await kick_connector_instance.start()

async def shutdown():
    await kick_connector_instance.stop()

# --- Suscripción a eventos del bus ---
def on_kick_logout(data):
    """Escucha el evento de logout para detener el conector."""
    print("(Kick Connector) Recibido evento de logout.")
    if kick_connector_instance.running:
        asyncio.create_task(kick_connector_instance.stop())

bus.subscribe("auth:kick_logout", on_kick_logout)

# --- ¡NUEVO BLOQUE! ---
# Suscripción a evento de login
def on_kick_auth_complete(data):
    """Escucha el evento de login exitoso para iniciar el conector."""
    if data.get("success") and not kick_connector_instance.running:
        print("(Kick Connector) Autenticación completada, iniciando...")
        # Usamos asyncio.create_task para llamar a la función async start
        # desde un contexto que podría no ser 'async'
        
        # Necesitamos encontrar o crear un bucle de eventos
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        loop.create_task(kick_connector_instance.start())

bus.subscribe("auth:kick_completed", on_kick_auth_complete)
# --- FIN DEL NUEVO BLOQUE ---
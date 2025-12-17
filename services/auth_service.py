import webbrowser
import socketserver
from urllib.parse import urlparse, parse_qs
import threading
import requests
import http.server
import json
import urllib.parse
import asyncio
from dotenv import load_dotenv
import os
from kickpython import KickAPI
from data import tokens as token_manager
from data.utils import get_persistent_data_path
from event_bus import bus
import time

# Común
REDIRECT_URI = "http://localhost:17563"
PORT = 17563
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

# --- Configuración ---
# Kick
KICK_CLIENT_ID = os.getenv("KICK_CLIENT_ID")
KICK_CLIENT_SECRET = os.getenv("KICK_CLIENT_SECRET")
KICK_SCOPES = ["user:read", "channel:read", "chat:write", "events:subscribe"]
KICK_DB_PATH = get_persistent_data_path("kick_tokens.db")

# Twitch (leído desde .env)
TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
TWITCH_SCOPES = os.getenv("TWITCH_SCOPES", "user:read:email chat:read chat:edit").split(" ")
TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize"
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"

# --- Servidor HTTP (Idéntico a antes) ---
code_received_event = threading.Event()
code_container = {}
httpd_server = None
class OAuthHandler(http.server.SimpleHTTPRequestHandler):
    """Manejador del servidor HTTP para atrapar el código OAuth."""
    def do_GET(self):
        global httpd_server
        path_parts = self.path.split('?')
        route_path = path_parts[0] # La parte antes de '?' (ej. /kick, /twitch)
        query_components = parse_qs(urlparse(self.path).query)

        if "code" in query_components: # --- SI LLEGA EL CÓDIGO ---
            platform = "unknown"
            if route_path.startswith('/kick'): platform = "kick"
            elif route_path.startswith('/twitch'): platform = "twitch"

            code_container['platform'] = platform
            code_container['code'] = query_components["code"][0]

            # Responde éxito al navegador
            self.send_response(200); self.send_header("Content-type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write("<h1>¡Autorización exitosa!</h1><p>Puedes cerrar esta ventana.</p>".encode("utf-8"))

            print("✅ Código recibido, enviando señal y apagando servidor...") # Mensaje de depuración
            code_received_event.set() # Avisa al hilo principal

            # --- APAGA EL SERVIDOR SOLO SI LLEGÓ EL CÓDIGO ---
            if httpd_server:
                threading.Thread(target=httpd_server.shutdown).start()
            # ------------------------------------------------

        else: # --- SI ES OTRA PETICIÓN (ej. /favicon.ico) ---
            print(f"⚠️ Petición GET ignorada (sin código): {self.path}")
            # Responde 404 Not Found
            self.send_response(404); self.send_header("Content-type", "text/html; charset=utf-8"); self.end_headers()
            self.wfile.write(b"<h1>Recurso no encontrado. Esperando codigo OAuth...</h1>")
            # --- NO APAGUES EL SERVIDOR AQUÍ ---

def start_http_server():
    global httpd_server
    try:
        with socketserver.TCPServer(("", PORT), OAuthHandler) as httpd:
            httpd_server = httpd; print(f"🖥️  (Auth Service) Servidor temporal en http://localhost:{PORT}")
            httpd.serve_forever()
    except Exception as e: print(f"❌ (Auth Service) Error servidor HTTP: {e}")
    print("🛑 (Auth Service) Servidor temporal detenido.")
# ------------------------------------

# --- Lógica de Autenticación KICK ---
async def initiate_kick_auth() -> bool:
    # (El código interno es idéntico a antes, simplemente usará las constantes KICK_CLIENT_ID/SECRET definidas arriba)
    if not KICK_CLIENT_ID or not KICK_CLIENT_SECRET: print("❌ Kick ID/Secret missing"); return False
    if token_manager.check_tokens_exist("kick"):
        print("ℹ️ (Auth Service) Kick ya configurado."); bus.publish("auth:kick_completed", {"success": True, "already_configured": True}); return True

    server_thread = threading.Thread(target=start_http_server, daemon=True); server_thread.start()
    kick_redirect_uri = REDIRECT_URI + '/kick'
    api = KickAPI(client_id=KICK_CLIENT_ID, client_secret=KICK_CLIENT_SECRET,
                  redirect_uri=kick_redirect_uri, db_path=KICK_DB_PATH)
    auth_data = api.get_auth_url(KICK_SCOPES)
    print("🌐 (Auth Service) Abriendo navegador Kick..."); webbrowser.open(auth_data["auth_url"])
    code_verifier = auth_data["code_verifier"]; print("⏳ (Auth Service) Esperando Kick...")
    loop = asyncio.get_running_loop(); await loop.run_in_executor(None, code_received_event.wait)

    success = False
    if 'code' in code_container and code_container.get('platform') == 'kick':
        code = code_container['code']; print("🔑 Código Kick recibido...")
        try:
            print("🔃 Intercambiando código Kick..."); token_data = await api.exchange_code(code, code_verifier)
            access_token = token_data['access_token']; print("✅ Token Kick guardado.")
            print("🔎 Buscando info canal Kick..."); url = "https://api.kick.com/public/v1/users"; headers = {"Authorization": f"Bearer {access_token}"}
            response = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers)); response.raise_for_status(); data = response.json()
            
            if data.get("data"): 
                user = data["data"][0]

                # --- LÓGICA DE FOTO SEGURA ---
                # 1. Recuperar configuración anterior (si existe)
                old_config = token_manager.load_kick_config()
                saved_pic = old_config.get("profile_image_url") if old_config else None
                
                # 2. Obtener la nueva foto de la API (que a veces viene rota)
                new_pic = user["profile_picture"]

                # 3. Decidir cuál usar:
                # Si tenemos una foto guardada y NO contiene 'cloudfront' (que es la que falla),
                # asumimos que es la foto manual buena y la mantenemos.
                final_pic = new_pic
                if saved_pic and "cloudfront" not in saved_pic:
                    final_pic = saved_pic

                config_data = {
                    "CHANNEL_NAME": user["name"], 
                    "BROADCASTER_ID": user["user_id"], 
                    "profile_image_url": final_pic 
                }
                # -----------------------------
                
                token_manager.save_kick_config(config_data); success = True
            else: print("❌ Info canal Kick vacía."); token_manager.delete_kick_files()
        except Exception as e: print(f"❌ Error auth Kick: {e}"); token_manager.delete_kick_files()
        finally: await api.close(); code_container.clear(); code_received_event.clear()
    elif 'code' in code_container: print(f"❌ Código recibido, plataforma incorrecta: {code_container.get('platform')}")
    else: print("❌ No se recibió código Kick."); await api.close()
    bus.publish("auth:kick_completed", {"success": success}); return success

# --- Lógica de Autenticación TWITCH ---
async def initiate_twitch_auth() -> bool:
    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        print("❌ Twitch ID/Secret missing"); return False
    
    if token_manager.check_tokens_exist("twitch"):
        print("ℹ️ (Auth Service) Twitch ya configurado."); 
        bus.publish("auth:twitch_completed", {"success": True, "already_configured": True}); 
        return True

    # Inicia el servidor HTTP en un hilo (reutiliza el de Kick)
    server_thread = threading.Thread(target=start_http_server, daemon=True); server_thread.start()
    
    twitch_redirect_uri = REDIRECT_URI + '/twitch' # La ruta que el handler espera
    
    # 1. Abrir navegador
    params = {
        "client_id": TWITCH_CLIENT_ID,
        "redirect_uri": twitch_redirect_uri,
        "response_type": "code",
        "scope": " ".join(TWITCH_SCOPES)
    }
    url = f"{TWITCH_AUTH_URL}?{urllib.parse.urlencode(params)}"
    print("🌐 (Auth Service) Abriendo navegador Twitch..."); webbrowser.open(url)
    print("⏳ (Auth Service) Esperando Twitch...")

    # 2. Esperar el código (usa el mismo evento que Kick)
    loop = asyncio.get_running_loop(); 
    await loop.run_in_executor(None, code_received_event.wait)

    success = False
    if 'code' in code_container and code_container.get('platform') == 'twitch':
        code = code_container['code']; print("🔑 Código Twitch recibido...")
        
        # 3. Intercambiar código por token
        try:
            print("🔃 Intercambiando código Twitch...");
            token_data = {
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": twitch_redirect_uri
            }
            
            # Usamos run_in_executor para la llamada de requests
            response = await loop.run_in_executor(
                None, lambda: requests.post(TWITCH_TOKEN_URL, data=token_data)
            )
            response.raise_for_status() # Lanza error si falla
            tokens = response.json()
            access_token = tokens['access_token']
            print("✅ Token Twitch obtenido.")

            # 4. Obtener info del usuario
            print("🔎 Buscando info usuario Twitch...");
            headers = {"Authorization": f"Bearer {access_token}", "Client-Id": TWITCH_CLIENT_ID}
            response = await loop.run_in_executor(
                None, lambda: requests.get("https://api.twitch.tv/helix/users", headers=headers)
            )
            response.raise_for_status()
            user_data = response.json()["data"][0]
            
            # 5. Guardar tokens y config
            full_token_data = {
                "access_token": access_token,
                "refresh_token": tokens.get("refresh_token"),
                "expires_in": tokens.get("expires_in"),
                "expires_at": int(time.time()) + int(tokens.get("expires_in", 3600)), 
                "username": user_data["login"],
                "channel": user_data["login"], 
                "user_id": user_data["id"],
                "profile_image_url": user_data["profile_image_url"]
            }
            token_manager.save_twitch_tokens(full_token_data)
            success = True
            
        except Exception as e:
            print(f"❌ Error auth Twitch: {e}"); 
            token_manager.delete_twitch_tokens()
        finally:
            code_container.clear(); 
            code_received_event.clear()
            
    elif 'code' in code_container: print(f"❌ Código recibido, plataforma incorrecta: {code_container.get('platform')}")
    else: print("❌ No se recibió código Twitch.")

    bus.publish("auth:twitch_completed", {"success": success}); 
    return success

# --- Logout/Estado (Sin cambios) ---
def logout(platform: str) -> bool:
    success = token_manager.logout(platform)
    bus.publish(f"auth:{platform}_logout", {"success": success}); return success

def check_auth_status(platform: str) -> bool:
    return token_manager.check_tokens_exist(platform)
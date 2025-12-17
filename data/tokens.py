# Guarda esto en: data/tokens.py
import json
import os
import sqlite3
from .utils import get_persistent_data_path
import time
import requests

KICK_DB_PATH = get_persistent_data_path("kick_tokens.db")
KICK_CONFIG_FILE = get_persistent_data_path("kick_config.json")
TWITCH_TOKEN_FILE = get_persistent_data_path("twitch_tokens.json")
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"

# --- KICK ---
def save_kick_config(config_data):
    try:
        with open(KICK_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4)
        print(f"(Token Manager) Configuración de Kick guardada en '{KICK_CONFIG_FILE}'")
    except Exception as e:
        print(f"(Token Manager) Error guardando config Kick: {e}")

def load_kick_config():
    if not os.path.exists(KICK_CONFIG_FILE): return None
    try:
        with open(KICK_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"(Token Manager) Error cargando config Kick: {e}")
        return None

def get_kick_token_from_db(): # Usado por sender_processor
    if not os.path.exists(KICK_DB_PATH): return None
    try:
        con = sqlite3.connect(KICK_DB_PATH)
        cur = con.cursor()
        cur.execute("SELECT access_token FROM tokens ORDER BY expires_at DESC LIMIT 1")
        result = cur.fetchone()
        con.close()
        return result[0] if result else None
    except Exception as e:
        print(f"(Token Manager) Error leyendo DB Kick: {e}")
        return None

def delete_kick_files():
    deleted = False
    try:
        if os.path.exists(KICK_DB_PATH):
            os.remove(KICK_DB_PATH); deleted = True
        if os.path.exists(KICK_CONFIG_FILE):
            os.remove(KICK_CONFIG_FILE); deleted = True
        # Borrar archivos -journal
        journal_file = KICK_DB_PATH + "-journal"
        if os.path.exists(journal_file): os.remove(journal_file)

        if deleted: print("(Token Manager) Archivos de Kick eliminados.")
        return deleted
    except Exception as e:
        print(f"(Token Manager) Error eliminando archivos Kick: {e}")
        return False

# --- TWITCH ---
def save_twitch_tokens(token_data):
    """Guarda los tokens de Twitch en un archivo JSON, asegurando client_id/secret."""
    try:
        # Si ya existen tokens anteriores, preservar los campos faltantes
        old = load_twitch_tokens() or {}

        token_data.setdefault("username", old.get("username"))
        token_data.setdefault("channel", old.get("channel"))

        with open(TWITCH_TOKEN_FILE, "w", encoding="utf-8") as f:
            json.dump(token_data, f, indent=4)

        print(f"(Token Manager) Tokens de Twitch guardados en '{TWITCH_TOKEN_FILE}'")

    except Exception as e:
        print(f"(Token Manager) Error guardando tokens Twitch: {e}")

def load_twitch_tokens():
    """Carga los tokens de Twitch desde un archivo JSON."""
    if not os.path.exists(TWITCH_TOKEN_FILE):
        return None
    try:
        with open(TWITCH_TOKEN_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"(Token Manager) Error cargando tokens Twitch: {e}")
        return None

def delete_twitch_tokens():
    """Elimina el archivo de tokens de Twitch."""
    deleted = False
    try:
        if os.path.exists(TWITCH_TOKEN_FILE):
            os.remove(TWITCH_TOKEN_FILE)
            deleted = True
            print("(Token Manager) Archivo de tokens de Twitch eliminado.")
        return deleted
    except Exception as e:
        print(f"(Token Manager) Error eliminando archivo Twitch: {e}")
        return False
    
def save_twitch_tokens_with_expiry(data):
    """Guarda tokens incluyendo expires_at"""
    data["expires_at"] = int(time.time()) + int(data.get("expires_in", 3600))
    save_twitch_tokens(data)

def twitch_token_expired(tokens):
    """Devuelve True si ya está vencido"""
    expires_at = tokens.get("expires_at")
    if not expires_at:
        return True
    return time.time() >= expires_at

def refresh_twitch_token():
    tokens = load_twitch_tokens()
    if not tokens:
        print("(Token Manager) No hay tokens para refrescar.")
        return None

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("(Token Manager) No existe refresh_token.")
        return None

    # --- CAMBIO AQUÍ: Leemos las variables justo antes de usarlas ---
    client_id = os.getenv("TWITCH_CLIENT_ID")
    client_secret = os.getenv("TWITCH_CLIENT_SECRET")
    # ---------------------------------------------------------------

    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,         # Usamos la variable local
        "client_secret": client_secret  # Usamos la variable local
    }

    try:
        response = requests.post(TWITCH_TOKEN_URL, data=data)
        resp_json = response.json()

        if response.status_code != 200:
            print("(Token Manager) Error al refrescar Twitch:", resp_json)
            return None

        # Actualizar tokens y guardar
        new_access = resp_json["access_token"]
        new_refresh = resp_json.get("refresh_token", refresh_token)

        tokens["access_token"] = new_access
        tokens["refresh_token"] = new_refresh
        tokens["expires_in"] = resp_json.get("expires_in")

        save_twitch_tokens(tokens)

        print("(Token Manager) Token Twitch refrescado correctamente.")
        return tokens

    except Exception as e:
        print(f"(Token Manager) Excepción refrescando Twitch: {e}")
        return None



# --- GENERAL ---
def check_tokens_exist(platform: str) -> bool:
    if platform == "kick":
        return os.path.exists(KICK_DB_PATH) and os.path.exists(KICK_CONFIG_FILE)
    elif platform == "twitch":
        return os.path.exists(TWITCH_TOKEN_FILE)
    return False

def logout(platform: str) -> bool:
     print(f"(Token Manager) Intentando desvincular {platform}...")
     if platform == "kick":
         return delete_kick_files()
     elif platform == "twitch":
         return delete_twitch_tokens()
     return False
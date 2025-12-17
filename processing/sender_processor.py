import requests
import json
import asyncio
from data import tokens as token_manager
from event_bus import bus

# --- Función de Envío KICK ---
async def send_kick_message(message_text: str):
    access_token = token_manager.get_kick_token_from_db()
    kick_config = token_manager.load_kick_config()
    broadcaster_id = kick_config.get("BROADCASTER_ID") if kick_config else None

    if not access_token or not broadcaster_id:
        print("(Sender Kick) Falta token o ID de broadcaster para enviar.")
        return

    url = "https://api.kick.com/public/v1/chat"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {"broadcaster_user_id": broadcaster_id, "content": message_text, "type": "user"}

    print(f"(Sender Kick) Enviando: '{message_text}'")
    loop = asyncio.get_running_loop()
    try:
        response = await loop.run_in_executor(
            None, lambda: requests.post(url, headers=headers, data=json.dumps(payload))
        )
        if response.status_code == 200:
            print(f"(Sender Kick) Mensaje enviado.")
        else:
            print(f"(Sender Kick) Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"(Sender Kick) Excepción al enviar: {e}")

# --- Callback para el Event Bus ---
async def handle_reply_event(data: dict):
    """Escucha eventos command:reply y envía el mensaje."""
    platform = data.get("platform")
    response = data.get("response")

    if not platform or not response:
        print("(Sender Processor) Evento de respuesta inválido.")
        return

    if platform == "kick":
        await send_kick_message(response)
    
    elif platform == "twitch":
        print("(Sender Processor) Ignorando Twitch (manejado por conector).")
        return
        
    else:
        print(f"(Sender Processor) Plataforma desconocida para enviar: {platform}")

# Suscribirse al evento de respuestas
bus.subscribe("command:reply", handle_reply_event)
print("(Sender Processor) Suscrito a eventos de respuesta.")

# Podríamos suscribirnos a otros eventos como "tts:say" aquí también
# bus.subscribe("tts:say", handle_tts_event)
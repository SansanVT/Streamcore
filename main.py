import webview
import os
import pathlib
import threading
import json
import asyncio
from api import Api
from event_bus import bus
from connectors import kick_connector
from processing import chat_processor, sender_processor
from services import auth_service
from connectors import twitch_connector
# Al importar esto, el servicio TTS arranca automáticamente:
from services import tts_service 

# --------------------------------

# --- Define rutas ---
script_dir = pathlib.Path(__file__).parent.resolve()
html_path = script_dir / 'web' / 'streamcore_dashboard.html'
html_file_abs_path = str(html_path)
# --------------------

# --- LÓGICA DE ARRANQUE ---
async def start_connectors_async():
    """Intenta inicializar los conectores si están autenticados."""
    print("Verificando conectores en segundo plano...")
    tasks = []
    
    if auth_service.check_auth_status("kick"):
        print("   - Kick está configurado. Intentando iniciar...")
        tasks.append(asyncio.create_task(kick_connector.kick_connector_instance.start()))
    else:
        print("   - Kick no configurado, omitiendo inicio.")

    if auth_service.check_auth_status("twitch"):
        print("   - Twitch está configurado. Intentando iniciar...")
        loop = asyncio.get_running_loop()
        tasks.append(loop.run_in_executor(None, twitch_connector.twitch_connector_instance.start))
    else:
        print("   - Twitch no configurado, omitiendo inicio.")

    if tasks:
        await asyncio.gather(*tasks)
    print("🏁 Verificación de conectores completada.")

def run_async_connectors_in_thread():
    """Wrapper para correr el chequeo inicial en un hilo."""
    print("Creando hilo para chequeo inicial de conectores...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(start_connectors_async())
    except Exception as e:
        print(f"Error en el hilo de conectores: {e}")
    finally:
        print("Hilo de chequeo de conectores finalizado.")
# --------------------------------------------------------

if __name__ == '__main__':
    print("Iniciando StreamCore...")
    print("   - Inicializando procesadores (suscribiéndose)...")
    
    # Inicializamos procesadores simplemente importándolos o referenciándolos
    _ = chat_processor
    _ = sender_processor
    # _ = tts_service (Ya está importado arriba, así que ya está corriendo)

    api_instance = Api()

    # Crea la ventana
    window = webview.create_window(
        'StreamCore',
        html_file_abs_path,
        js_api=api_instance,
        width=1280,
        height=720
    )

    # --- HILO DE CONEXIÓN ---
    print("   - Creando hilo para chequeo inicial de conectores...")
    connector_thread = threading.Thread(target=run_async_connectors_in_thread, daemon=True)
    connector_thread.start()
    
    # --- PUENTE DE EVENTOS TTS (Backend -> Frontend) ---
    def forward_tts_event():
        """
        Escucha 'tts:new' en el event bus y lo despacha al frontend
        para que se muestre en la lista visual (sin audio si viene del chat).
        """
        def _handler(data):
            try:
                payload = json.dumps(data)
            except Exception as e:
                print(f"[forward_tts_event] Error serializando payload: {e}")
                payload = json.dumps({"user": "Error", "message": "Error serializando"})
            
            # Inyectamos el evento en JS
            script = f"window.dispatchEvent(new CustomEvent('tts:new', {{ detail: {payload} }}));"
            try:
                window.evaluate_js(script)
            except Exception as e:
                # Si la ventana no está lista aún, puede fallar, es normal al inicio
                pass

        bus.subscribe("tts:new", _handler)

    # Iniciamos el puente
    forward_tts_event()

    # --- NUEVO PUENTE PARA STATS ---
    def forward_stats_event():
        """
        Escucha 'stats:updated' en Python y le avisa a JS
        para que refresque los números inmediatamente.
        """
        def _handler(data):
            # Ejecutamos un script simple en JS que dispara el evento
            # No necesitamos pasar datos pesados, solo el aviso "actualízate"
            try:
                window.evaluate_js("window.dispatchEvent(new CustomEvent('stats:updated'));")
            except Exception as e:
                print(f"Error enviando stats a UI: {e}")

        bus.subscribe("stats:updated", _handler)

    forward_stats_event() # <--- ¡No olvides llamarla para que arranque!

    print("Iniciando interfaz gráfica...")
    webview.start(debug=False)

    # --- Lógica de apagado ---
    shutdown_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(shutdown_loop)
    try:
        print("   - Solicitando detención de Kick...")
        shutdown_loop.run_until_complete(kick_connector.shutdown())
    except Exception as e: print(f"   - Error deteniendo Kick: {e}")

    try:
        print("   - Solicitando detención de Twitch...")
        twitch_connector.shutdown()
    except Exception as e: print(f"   - Error deteniendo Twitch: {e}")

    print("\nAplicación cerrada. Deteniendo componentes...")
    shutdown_loop.close()
    print("¡Adiós!")
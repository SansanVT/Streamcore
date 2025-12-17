import asyncio
from collections import defaultdict
import threading # <<< --- ¡IMPORTANTE AÑADIR ESTA LÍNEA!

class EventBus:
    def __init__(self):
        self._subscribers = defaultdict(list)
        print("Event Bus inicializado.")

    def subscribe(self, event_type: str, callback):
        """Registra una función para escuchar un evento."""
        print(f"Suscribiendo '{getattr(callback, '__name__', 'callback')}' al evento '{event_type}'")
        self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback):
        """Elimina una suscripción."""
        try:
            self._subscribers[event_type].remove(callback)
            print(f"Desuscribiendo '{getattr(callback, '__name__', 'callback')}' del evento '{event_type}'")
        except ValueError:
            pass 

    def publish(self, event_type: str, data=None):
        """Envía un evento a todos los suscriptores."""
        # Quitamos el log de 'data' para no spamear la consola con mensajes
        print(f"Publicando evento '{event_type}'...") 
        
        if event_type in self._subscribers:
            for callback in self._subscribers[event_type]:
                
                if asyncio.iscoroutinefunction(callback):
                    def run_async_task(coro, data):
                        try:
                            asyncio.run(coro(data))
                        except Exception as e:
                            print(f"Error en hilo de callback async para '{event_type}': {e}")
                    
                    threading.Thread(target=run_async_task, args=(callback, data), daemon=True).start()
                
                else:
                    # Los callbacks síncronos se ejecutan directamente
                    try:
                        callback(data)
                    except Exception as e:
                        print(f"Error ejecutando callback síncrono para '{event_type}': {e}")


# Instancia global única del bus de eventos
bus = EventBus()
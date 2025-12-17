import os
import sys
import pathlib

def get_persistent_data_path(filename: str) -> str:
    """Devuelve la ruta completa a un archivo en la carpeta de datos persistentes."""
    APP_NAME = "StreamCoreData" # Nombre de la carpeta para guardar datos
    
    # Encuentra la carpeta de datos de aplicación apropiada
    if sys.platform == "win32":
        # Windows: %LOCALAPPDATA%\StreamCoreData
        base_path = pathlib.Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')))
    elif sys.platform == "darwin": # macOS
        # macOS: ~/Library/Application Support/StreamCoreData
        base_path = pathlib.Path(os.path.expanduser('~/Library/Application Support'))
    else: # Linux y otros
        # Linux: ~/.local/share/StreamCoreData (o $XDG_DATA_HOME/StreamCoreData)
        base_path = pathlib.Path(os.environ.get('XDG_DATA_HOME', os.path.expanduser('~/.local/share')))
        
    # Crea la ruta completa a nuestra carpeta específica
    app_data_dir = base_path / APP_NAME
    
    # Crea la carpeta si no existe (importante)
    app_data_dir.mkdir(parents=True, exist_ok=True)
    
    # Devuelve la ruta completa al archivo deseado dentro de esa carpeta
    return str(app_data_dir / filename)
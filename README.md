# StreamCore 🚀

**StreamCore** es una solución de escritorio diseñada para creadores de contenido en crecimiento que buscan una herramienta eficiente, ligera y centralizada para gestionar la interacción con su audiencia en tiempo real.

![Estado](https://img.shields.io/badge/Estado-Estable-green) ![Plataformas](https://img.shields.io/badge/Plataformas-Twitch%20%7C%20Kick-purple)

## 🌟 Características Principales

El programa adapta su funcionalidad según las plataformas conectadas:

* **⚡ Comandos de Chat:** Gestión de comandos personalizados (`!redes`, `!discord`) con respuestas dinámicas, contadores y restricción de permisos.
* **🗣️ Text-to-Speech (TTS):** Lectura de mensajes en tiempo real con control de velocidad, filtros de palabras prohibidas y cola inteligente.
* **📋 Control de Asistencias:** Registro automatizado de espectadores (`!presente`) con exportación a **Excel/CSV** para sorteos y análisis.

## 🔒 Filosofía "Cero Datos"

Tu privacidad es prioridad. StreamCore opera **100% localmente**:
* **Sin Telemetría:** No recopilamos datos de uso.
* **Sin Servidores Externos:** Tu configuración vive en tu PC.
* **Autenticación Segura:** Usamos OAuth oficial de Twitch y Kick. Tus contraseñas nunca se guardan.

## 📥 Descarga e Instalación

1.  Ve a la sección de [Releases](https://github.com/SansanVT/Streamcore/releases) a la derecha.
2.  Descarga el archivo `.zip` de la última versión.
3.  Descomprime el archivo.
4.  Ejecuta `StreamCore.exe`.
5.  *(Opcional)* Lee el **Manual de Usuario** incluido para aprender a configurarlo.

## 🛠️ Instalación para Desarrolladores (Código Fuente)

Si deseas ejecutar el código fuente o contribuir:

1.  Clona este repositorio.
2.  Instala las dependencias: `pip install -r requirements.txt`.
3.  Descarga `ffmpeg.exe` y `ffprobe.exe` y colócalos en la carpeta `bin/`.
4.  Ejecuta `main.py`.

---
*Desarrollado con ❤️ por SansanVT y su gran equipo de trabajo, al cual preguntaré como darles créditos apropiadamente*

El programa fue desarrollado en 2 meses con ayuda de IA, sin embargo, se revisó manualmente el código con el fin de cumplir las normas de seguridad, conforme se actualice el programa, se ira puliendo el código con más calma, y eliminando comentarios innecesarios y, en caso de requerirlo, generar una documentación sólida que permita formar un proyecto más grande.

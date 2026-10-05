"""
Generación de respuestas con Gemini, en streaming.

Como embeddings.py, es el único archivo que conoce al proveedor. La
interfaz es un generador: `generar()` va entregando trozos de texto
conforme el modelo los escribe.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class ErrorChat(Exception):
    """Error con un mensaje listo para mostrarle al usuario."""


MENSAJE_LIMITE = "Gemini está saturado o se alcanzó el límite del plan gratuito. Espera un minuto e inténtalo de nuevo."
MENSAJE_CLAVE = "La clave de Gemini no es válida o falta. Revisa GEMINI_API_KEY en tu .env."
MENSAJE_GENERAL = "No se pudo generar la respuesta. Inténtalo de nuevo."


class ProveedorChatGemini:
    def __init__(self, api_key, modelos):
        if not api_key:
            raise ErrorChat(MENSAJE_CLAVE)
        from google import genai

        self.cliente = genai.Client(api_key=api_key)
        # El primero es el principal; los demás, respaldo si falla antes de empezar
        self.modelos = modelos

    def generar(self, sistema, contenido):
        from google.genai import errors, types

        configuracion = types.GenerateContentConfig(
            system_instruction=sistema,
            temperature=0.2,  # fidelidad al texto, no creatividad
            # Poco "razonamiento interno": la respuesta empieza antes
            thinking_config=types.ThinkingConfig(thinking_level="low"),
        )
        ultimo_error = None
        for modelo in self.modelos:
            empezo = False
            try:
                for trozo in self.cliente.models.generate_content_stream(
                    model=modelo, contents=contenido, config=configuracion
                ):
                    if trozo.text:
                        empezo = True
                        yield trozo.text
                return
            except errors.APIError as error:
                ultimo_error = error
                logger.warning("Gemini (%s) respondió %s", modelo, error.code)
                if error.code in (401, 403) or (error.code == 400 and "API key" in str(error)):
                    raise ErrorChat(MENSAJE_CLAVE) from error
                # Si ya mandamos texto no podemos cambiar de modelo a media respuesta
                if empezo or not (error.code == 429 or error.code >= 500):
                    break
            except Exception as error:
                logger.exception("Falló la conexión con Gemini (%s)", modelo)
                ultimo_error = error
                if empezo:
                    break
        if isinstance(ultimo_error, errors.APIError) and (ultimo_error.code == 429 or ultimo_error.code >= 500):
            raise ErrorChat(MENSAJE_LIMITE) from ultimo_error
        raise ErrorChat(MENSAJE_GENERAL) from ultimo_error


def obtener_proveedor_chat():
    modelos = [settings.FOLIO_CHAT_MODELO]
    if settings.FOLIO_CHAT_MODELO_RESPALDO:
        modelos.append(settings.FOLIO_CHAT_MODELO_RESPALDO)
    return ProveedorChatGemini(settings.GEMINI_API_KEY, modelos)

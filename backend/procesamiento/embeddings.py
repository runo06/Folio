"""
Generación de embeddings.

Es el ÚNICO archivo que conoce a Gemini. Si mañana cambiamos de proveedor
(por ejemplo, a Voyage), escribimos otra clase con el mismo método
`embeber()` y la devolvemos en obtener_proveedor(). Nada más cambia.

Dos tipos de error, porque se tratan distinto:
  - ErrorTemporal: "demasiadas peticiones", servidor caído, sin red...
    Vale la pena reintentar más tarde.
  - ErrorEmbeddings: clave inválida, petición mal formada...
    Reintentar no lo arregla; hay que avisar al usuario.
"""
import logging
import math

from django.conf import settings

logger = logging.getLogger(__name__)

# Debe coincidir con la columna vector(768) de la base de datos
DIMENSIONES = 768
# Gemini acepta hasta 100 textos por petición
TAMANO_LOTE = 100


class ErrorEmbeddings(Exception):
    """Error permanente: reintentar no sirve."""


class ErrorTemporal(Exception):
    """Error pasajero: conviene reintentar más tarde."""


def normalizar(vector):
    """
    Escala el vector para que mida 1 (norma L2). Google lo pide cuando se
    usan menos de 3072 dimensiones, para que la distancia coseno sea fiable.
    """
    norma = math.sqrt(sum(valor * valor for valor in vector))
    if norma == 0:
        return list(vector)
    return [valor / norma for valor in vector]


class ProveedorGemini:
    # Gemini optimiza el vector según el uso: guardar documentos o buscar con una pregunta
    TAREAS = {"documento": "RETRIEVAL_DOCUMENT", "consulta": "RETRIEVAL_QUERY"}

    def __init__(self, api_key, modelo):
        if not api_key:
            raise ErrorEmbeddings(
                "Falta la clave de Gemini. Agrégala como GEMINI_API_KEY en tu archivo .env y ejecuta: docker compose up -d worker"
            )
        # Importamos aquí para que las pruebas no necesiten el SDK configurado
        from google import genai

        self.cliente = genai.Client(api_key=api_key)
        self.modelo = modelo

    def embeber(self, textos, tarea="documento"):
        from google.genai import errors, types

        configuracion = types.EmbedContentConfig(
            task_type=self.TAREAS[tarea],
            output_dimensionality=DIMENSIONES,
        )
        try:
            respuesta = self.cliente.models.embed_content(
                model=self.modelo, contents=textos, config=configuracion
            )
        except errors.APIError as error:
            if error.code == 429 or error.code >= 500:
                raise ErrorTemporal(f"Gemini respondió {error.code}") from error
            if error.code in (401, 403) or (error.code == 400 and "API key" in str(error)):
                raise ErrorEmbeddings("La clave de Gemini no es válida. Revisa GEMINI_API_KEY en tu .env.") from error
            logger.exception("Gemini rechazó la petición de embeddings")
            raise ErrorEmbeddings("Gemini rechazó la petición. Revisa los registros del worker.") from error
        except (ConnectionError, TimeoutError, OSError) as error:
            raise ErrorTemporal("No hubo conexión con Gemini") from error
        except Exception as error:
            # httpx (la librería HTTP del SDK) tiene sus propios errores de red
            if type(error).__module__.startswith("httpx"):
                raise ErrorTemporal("No hubo conexión con Gemini") from error
            raise

        return [normalizar(embedding.values) for embedding in respuesta.embeddings]


def obtener_proveedor():
    return ProveedorGemini(settings.GEMINI_API_KEY, settings.FOLIO_EMBEDDINGS_MODELO)


def nombre_modelo():
    return settings.FOLIO_EMBEDDINGS_MODELO


def generar_embeddings(textos, tarea="documento"):
    """Devuelve un vector por texto, en el mismo orden, pidiendo en lotes."""
    proveedor = obtener_proveedor()
    vectores = []
    for inicio in range(0, len(textos), TAMANO_LOTE):
        lote = textos[inicio : inicio + TAMANO_LOTE]
        resultado = proveedor.embeber(lote, tarea)
        if len(resultado) != len(lote) or any(len(v) != DIMENSIONES for v in resultado):
            raise ErrorEmbeddings("Gemini devolvió una cantidad o tamaño de vectores inesperado.")
        vectores.extend(resultado)
    return vectores

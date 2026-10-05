"""
Tarea en segundo plano: procesar un documento recién subido.

    pendiente ──> procesando ──> listo
                       └───────> error (con un mensaje para el usuario)

La ejecuta el worker de Celery, no el servidor web. Por eso la subida
responde al instante aunque esto tarde minutos.
"""
import logging

from celery import shared_task
from django.conf import settings
from django.db import transaction

from biblioteca.models import Documento

from .embeddings import ErrorEmbeddings, ErrorTemporal, generar_embeddings, nombre_modelo
from .extraccion import extraer_paginas, tiene_texto
from .fragmentacion import fragmentar_paginas
from .models import Fragmento

logger = logging.getLogger(__name__)

MAXIMO_REINTENTOS = 6  # esperas de 10, 20, 40, 80, 160 y 300 s: unos 10 minutos en total
MENSAJE_SIN_TEXTO = "Parece un PDF escaneado: no tiene texto que se pueda leer."
MENSAJE_LIMITE = "Gemini sigue sin responder o se alcanzó el límite del plan gratuito. Reintenta en unos minutos."
MENSAJE_INESPERADO = "Ocurrió un error inesperado al procesar el documento. Reintenta más tarde."


class DocumentoSinTexto(Exception):
    pass


def marcar(documento_id, estado, mensaje_error=""):
    # update() cambia solo estas columnas, sin pisar otros cambios
    Documento.objects.filter(pk=documento_id).update(estado=estado, mensaje_error=mensaje_error)


def procesar(documento):
    """Extrae, fragmenta, genera embeddings y guarda. Lanza excepción si algo falla."""
    with documento.archivo.open("rb") as archivo:
        paginas = extraer_paginas(archivo)

    con_texto = [(numero, texto) for numero, texto in paginas if tiene_texto(texto)]
    sin_texto = [numero for numero, texto in paginas if not tiene_texto(texto)]
    if not con_texto:
        raise DocumentoSinTexto(MENSAJE_SIN_TEXTO)

    fragmentos = fragmentar_paginas(
        con_texto, tamano=settings.FOLIO_FRAGMENTO_TAMANO, solape=settings.FOLIO_FRAGMENTO_SOLAPE
    )
    # Lo lento (llamar a Gemini) ocurre ANTES de abrir la transacción
    vectores = generar_embeddings([fragmento.texto for fragmento in fragmentos])
    modelo = nombre_modelo()

    # Todo o nada: si algo falla al guardar, no quedan fragmentos a medias.
    # Borramos los anteriores para que reprocesar no duplique.
    with transaction.atomic():
        Fragmento.objects.filter(documento=documento).delete()
        Fragmento.objects.bulk_create(
            Fragmento(
                documento=documento,
                pagina=fragmento.pagina,
                orden=fragmento.orden,
                texto=fragmento.texto,
                embedding=vector,
                modelo_embedding=modelo,
            )
            for fragmento, vector in zip(fragmentos, vectores)
        )
        Documento.objects.filter(pk=documento.pk).update(
            estado=Documento.Estado.LISTO, mensaje_error="", paginas_sin_texto=sin_texto
        )
    return len(fragmentos)


@shared_task(bind=True, max_retries=MAXIMO_REINTENTOS)
def procesar_documento(self, documento_id):
    # bind=True nos da "self": la propia tarea, para poder reintentarla
    documento = Documento.objects.filter(pk=documento_id).first()
    if documento is None:
        return  # lo borraron mientras esperaba en la cola

    marcar(documento_id, Documento.Estado.PROCESANDO)
    try:
        cantidad = procesar(documento)
        logger.info("Documento %s listo: %s fragmentos", documento_id, cantidad)
    except DocumentoSinTexto as error:
        marcar(documento_id, Documento.Estado.ERROR, str(error))
    except ErrorEmbeddings as error:
        marcar(documento_id, Documento.Estado.ERROR, str(error))
    except ErrorTemporal as error:
        if self.request.retries >= self.max_retries:
            logger.warning("Documento %s: se agotaron los reintentos (%s)", documento_id, error)
            marcar(documento_id, Documento.Estado.ERROR, MENSAJE_LIMITE)
            return
        espera = min(300, 10 * 2**self.request.retries)  # retroceso exponencial
        logger.info("Documento %s: %s. Reintento en %s s", documento_id, error, espera)
        marcar(documento_id, Documento.Estado.PENDIENTE)
        raise self.retry(exc=error, countdown=espera)
    except Exception:
        logger.exception("Error inesperado procesando el documento %s", documento_id)
        marcar(documento_id, Documento.Estado.ERROR, MENSAJE_INESPERADO)


def encolar_procesamiento(documento):
    """
    Deja el encargo en la cola cuando la transacción actual se confirme
    (si lo encoláramos antes, el worker podría buscar un documento que
    todavía no existe en la base de datos).
    """

    def encolar():
        try:
            procesar_documento.delay(documento.pk)
        except Exception:
            logger.exception("No se pudo encolar el documento %s", documento.pk)
            marcar(
                documento.pk,
                Documento.Estado.ERROR,
                "No se pudo iniciar el procesamiento. Revisa que Redis y el worker estén corriendo y reintenta.",
            )

    transaction.on_commit(encolar)

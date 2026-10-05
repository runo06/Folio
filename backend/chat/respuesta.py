"""
Flujo de una respuesta, como una secuencia de eventos:

    inicio   -> la conversación y la pregunta ya guardadas
    fuentes  -> los fragmentos numerados (antes del texto, para mostrar citas en vivo)
    texto    -> cada trozo de respuesta conforme llega (muchas veces)
    fin      -> la respuesta final guardada, con sus citas
    error    -> si algo falla (en lugar de "fin")

Es un generador de Python: cada `yield` entrega un evento y se pausa
hasta que el servidor lo envía al navegador.
"""
import logging

from django.utils import timezone

from procesamiento.embeddings import ErrorEmbeddings, ErrorTemporal

from .busqueda import buscar_fragmentos, hay_documentos_listos
from .modelo import MENSAJE_GENERAL, MENSAJE_LIMITE, ErrorChat, obtener_proveedor_chat
from .models import Conversacion, Mensaje
from .prompt import (
    FRASE_NO_ENCONTRE,
    INSTRUCCION_SISTEMA,
    MENSAJE_SIN_DOCUMENTOS,
    construir_contenido,
    construir_fuentes,
    procesar_respuesta,
    texto_para_busqueda,
)
from .serializers import ConversacionResumenSerializer, MensajeSerializer

logger = logging.getLogger(__name__)


def guardar_respuesta(conversacion, contenido, citas, sin_respuesta=False, interrumpida=False):
    mensaje = Mensaje.objects.create(
        conversacion=conversacion,
        rol=Mensaje.Rol.ASISTENTE,
        contenido=contenido,
        citas=citas,
        sin_respuesta=sin_respuesta,
        interrumpida=interrumpida,
    )
    # update() no falla si la conversación ya no existe (la borraron mientras tanto)
    Conversacion.objects.filter(pk=conversacion.pk).update(actualizada=timezone.now())
    return mensaje


def guardar_parcial(conversacion, partes, fuentes):
    """Guarda una respuesta cortada. Nunca debe lanzar error: se llama al cerrar."""
    if not partes:
        return
    try:
        texto, citas, _ = procesar_respuesta("".join(partes), fuentes)
        guardar_respuesta(conversacion, texto, citas, interrumpida=True)
    except Exception:
        logger.exception("No se pudo guardar la respuesta parcial de la conversación %s", conversacion.pk)


def fuentes_publicas(fuentes):
    """Lo que ve el navegador de cada fuente (un extracto, no el texto completo)."""
    return [
        {
            "numero": f["numero"],
            "documento_id": f["documento_id"],
            "documento": f["documento"],
            "pagina": f["pagina"],
            "extracto": f["texto"][:280],
        }
        for f in fuentes
    ]


def respuesta_fija(conversacion, texto):
    """Responde sin llamar al modelo (no hay nada en qué buscar)."""
    yield "fuentes", []
    yield "texto", {"delta": texto}
    mensaje = guardar_respuesta(conversacion, texto, [], sin_respuesta=True)
    yield "fin", {"mensaje": MensajeSerializer(mensaje).data}


def responder(conversacion, pregunta, historial, mensaje_usuario):
    yield "inicio", {
        "conversacion": ConversacionResumenSerializer(conversacion).data,
        "mensaje_usuario": MensajeSerializer(mensaje_usuario).data,
    }

    if not hay_documentos_listos(conversacion.coleccion):
        yield from respuesta_fija(conversacion, MENSAJE_SIN_DOCUMENTOS)
        return

    partes = []
    fuentes = []
    try:
        fragmentos = buscar_fragmentos(conversacion.coleccion, texto_para_busqueda(pregunta, historial))
        if not fragmentos:
            yield from respuesta_fija(conversacion, FRASE_NO_ENCONTRE)
            return

        fuentes = construir_fuentes(fragmentos)
        yield "fuentes", fuentes_publicas(fuentes)

        proveedor = obtener_proveedor_chat()
        contenido = construir_contenido(pregunta, fuentes, historial)
        for trozo in proveedor.generar(INSTRUCCION_SISTEMA, contenido):
            partes.append(trozo)
            yield "texto", {"delta": trozo}

    except GeneratorExit:
        # El usuario presionó "Detener" o cerró la página: guardamos lo que hubo
        guardar_parcial(conversacion, partes, fuentes)
        raise
    except (ErrorChat, ErrorEmbeddings) as error:
        mensaje_error = str(error)
    except ErrorTemporal:
        mensaje_error = MENSAJE_LIMITE
    except Exception:
        logger.exception("Error inesperado respondiendo en la conversación %s", conversacion.pk)
        mensaje_error = MENSAJE_GENERAL
    else:
        texto, citas, sin_respuesta = procesar_respuesta("".join(partes), fuentes)
        mensaje = guardar_respuesta(conversacion, texto, citas, sin_respuesta=sin_respuesta)
        yield "fin", {"mensaje": MensajeSerializer(mensaje).data}
        return

    # Si falló a medias, conservamos lo que alcanzó a escribir
    guardar_parcial(conversacion, partes, fuentes)
    yield "error", {"mensaje": mensaje_error}

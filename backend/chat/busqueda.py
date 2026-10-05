"""
Búsqueda semántica: encontrar los fragmentos más parecidos a una pregunta.
"""
from pgvector.django import CosineDistance

from biblioteca.models import Documento
from procesamiento.embeddings import generar_embeddings, nombre_modelo
from procesamiento.models import Fragmento

CANTIDAD_FRAGMENTOS = 8


def hay_documentos_listos(coleccion):
    return coleccion.documentos.filter(estado=Documento.Estado.LISTO).exists()


def buscar_fragmentos(coleccion, texto, cantidad=CANTIDAD_FRAGMENTOS):
    """
    1. Convierte el texto en un vector (tipo "consulta").
    2. Pide a PostgreSQL los fragmentos cuyo vector está más cerca, por
       distancia coseno, solo dentro de esta colección y de documentos
       listos, y solo vectores del mismo modelo (no se pueden mezclar).
    """
    [vector] = generar_embeddings([texto], tarea="consulta")
    return list(
        Fragmento.objects.filter(
            documento__coleccion=coleccion,
            documento__estado=Documento.Estado.LISTO,
            modelo_embedding=nombre_modelo(),
        )
        .select_related("documento")
        .annotate(distancia=CosineDistance("embedding", vector))
        .order_by("distancia")[:cantidad]
    )

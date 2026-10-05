import json

from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.views import APIView

from biblioteca.models import Coleccion

from .models import Conversacion, Mensaje
from .respuesta import responder
from .serializers import ConversacionSerializer, PreguntaSerializer

LARGO_TITULO = 80


def formato_sse(tipo, datos):
    """
    Server-Sent Events: cada evento son líneas "event:" y "data:"
    terminadas con una línea en blanco. El navegador las va leyendo
    conforme llegan, sin esperar a que termine la respuesta.
    """
    return f"event: {tipo}\ndata: {json.dumps(datos, ensure_ascii=False, default=str)}\n\n"


class PreguntarVista(APIView):
    """POST /api/colecciones/<id>/preguntar/  ->  flujo de eventos (text/event-stream)"""

    def post(self, request, pk):
        coleccion = get_object_or_404(Coleccion, pk=pk, propietario=request.user)
        entrada = PreguntaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        pregunta = entrada.validated_data["pregunta"]
        id_conversacion = entrada.validated_data.get("conversacion")

        if id_conversacion:
            conversacion = get_object_or_404(Conversacion, pk=id_conversacion, coleccion=coleccion)
        else:
            titulo = pregunta if len(pregunta) <= LARGO_TITULO else pregunta[: LARGO_TITULO - 1].rstrip() + "…"
            conversacion = Conversacion.objects.create(coleccion=coleccion, titulo=titulo)

        historial = list(conversacion.mensajes.all())
        mensaje_usuario = Mensaje.objects.create(
            conversacion=conversacion, rol=Mensaje.Rol.USUARIO, contenido=pregunta
        )

        eventos = responder(conversacion, pregunta, historial, mensaje_usuario)

        def flujo():
            try:
                for tipo, datos in eventos:
                    yield formato_sse(tipo, datos)
            finally:
                # Si el navegador corta la conexión ("Detener"), cerramos también
                # el generador interno para que guarde la respuesta parcial
                eventos.close()

        respuesta = StreamingHttpResponse(flujo(), content_type="text/event-stream; charset=utf-8")
        respuesta["Cache-Control"] = "no-cache"
        respuesta["X-Accel-Buffering"] = "no"  # que ningún proxy junte los eventos
        return respuesta


class ConversacionVista(generics.RetrieveAPIView):
    serializer_class = ConversacionSerializer

    def get_queryset(self):
        return Conversacion.objects.filter(coleccion__propietario=self.request.user).prefetch_related("mensajes")

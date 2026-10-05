"""
Regla de oro de este archivo: toda consulta empieza filtrando por
request.user. Si un usuario pide algo que no es suyo, la consulta
simplemente no lo encuentra y responde 404. Ni siquiera le confirmamos
que ese id existe.
"""
from django.db.models import Count, Prefetch, Sum
from django.db.models.functions import Coalesce
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from procesamiento.tasks import encolar_procesamiento

from .models import Coleccion, Documento
from .serializers import ColeccionSerializer, DocumentoSerializer, SubidaDocumentoSerializer


class ColeccionViewSet(viewsets.ModelViewSet):
    """Listar, crear, ver, renombrar y borrar colecciones propias."""

    serializer_class = ColeccionSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Coleccion.objects.filter(propietario=self.request.user)
            .annotate(
                total_documentos=Count("documentos"),
                total_paginas=Coalesce(Sum("documentos__num_paginas"), 0),
            )
            # Trae las páginas de todos los documentos en UNA consulta extra,
            # en vez de una consulta por colección
            .prefetch_related(
                Prefetch("documentos", queryset=Documento.objects.only("id", "coleccion_id", "num_paginas"))
            )
        )

    def perform_create(self, serializer):
        serializer.save(propietario=self.request.user)


class DocumentosDeColeccionVista(generics.ListCreateAPIView):
    """GET: documentos de una colección. POST: subir un PDF (multipart)."""

    parser_classes = [MultiPartParser]

    def get_serializer_class(self):
        return SubidaDocumentoSerializer if self.request.method == "POST" else DocumentoSerializer

    def get_coleccion(self):
        return get_object_or_404(Coleccion, pk=self.kwargs["pk"], propietario=self.request.user)

    def get_queryset(self):
        return Documento.objects.filter(coleccion=self.get_coleccion())

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        if self.request.method == "POST":
            contexto["coleccion"] = self.get_coleccion()
        return contexto

    def perform_create(self, serializer):
        documento = serializer.save()
        # El procesamiento corre en segundo plano: la respuesta sale ya
        encolar_procesamiento(documento)


class DocumentoViewSet(mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Ver, borrar y descargar un documento propio."""

    serializer_class = DocumentoSerializer

    def get_queryset(self):
        return Documento.objects.filter(coleccion__propietario=self.request.user)

    @action(detail=True, methods=["post"])
    def reprocesar(self, request, pk=None):
        """Vuelve a poner en la cola un documento (por ejemplo, tras un error)."""
        documento = self.get_object()
        if documento.estado == Documento.Estado.PROCESANDO:
            return Response(
                {"detail": "El documento ya se está procesando."}, status=status.HTTP_409_CONFLICT
            )
        documento.estado = Documento.Estado.PENDIENTE
        documento.mensaje_error = ""
        documento.save(update_fields=["estado", "mensaje_error"])
        encolar_procesamiento(documento)
        return Response(DocumentoSerializer(documento).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["get"])
    def archivo(self, request, pk=None):
        documento = self.get_object()
        return FileResponse(
            documento.archivo.open("rb"),
            content_type="application/pdf",
            as_attachment=False,  # "inline": el navegador lo muestra en vez de descargarlo
            filename=documento.nombre_original,
        )

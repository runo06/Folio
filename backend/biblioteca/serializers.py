from django.conf import settings
from django.urls import reverse
from rest_framework import serializers

from .models import Coleccion, Documento
from .validadores import analizar_pdf


class ColeccionSerializer(serializers.ModelSerializer):
    # Viene de una anotación en la consulta (ver la vista), no de una columna
    total_documentos = serializers.IntegerField(read_only=True, default=0)
    total_paginas = serializers.IntegerField(read_only=True, default=0)
    # Páginas de cada documento: el frontend las dibuja como lomos de libro
    paginas_por_documento = serializers.SerializerMethodField()

    class Meta:
        model = Coleccion
        fields = [
            "id", "nombre", "descripcion", "total_documentos", "total_paginas",
            "paginas_por_documento", "creada", "actualizada",
        ]
        read_only_fields = ["creada", "actualizada"]

    def get_paginas_por_documento(self, coleccion):
        # .all() usa los documentos ya precargados por la vista (prefetch)
        return [documento.num_paginas for documento in coleccion.documentos.all()]

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        propietario = self.context["request"].user
        repetidas = Coleccion.objects.filter(propietario=propietario, nombre__iexact=valor)
        if self.instance:
            repetidas = repetidas.exclude(pk=self.instance.pk)
        if repetidas.exists():
            raise serializers.ValidationError("Ya tienes una colección con ese nombre.")
        return valor


class DocumentoSerializer(serializers.ModelSerializer):
    url_archivo = serializers.SerializerMethodField()

    class Meta:
        model = Documento
        fields = [
            "id", "coleccion", "nombre_original", "tamano_bytes", "num_paginas",
            "estado", "mensaje_error", "paginas_sin_texto", "subido", "url_archivo",
        ]
        read_only_fields = fields

    def get_url_archivo(self, documento):
        return reverse("documento-archivo", args=[documento.pk])


class SubidaDocumentoSerializer(serializers.Serializer):
    """Recibe el archivo, lo valida y crea el Documento."""

    archivo = serializers.FileField()

    def validate_archivo(self, archivo):
        self.num_paginas = analizar_pdf(archivo)
        return archivo

    def validate(self, datos):
        propietario = self.context["request"].user
        maximo = settings.FOLIO_MAX_DOCUMENTOS_POR_USUARIO
        if Documento.objects.filter(coleccion__propietario=propietario).count() >= maximo:
            raise serializers.ValidationError(f"Alcanzaste el límite de {maximo} documentos.")
        return datos

    def create(self, datos):
        archivo = datos["archivo"]
        return Documento.objects.create(
            coleccion=self.context["coleccion"],
            archivo=archivo,
            nombre_original=archivo.name[:255],
            tamano_bytes=archivo.size,
            num_paginas=self.num_paginas,
        )

    def to_representation(self, documento):
        # Tras subirlo, respondemos con el documento completo
        return DocumentoSerializer(documento, context=self.context).data

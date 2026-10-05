import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Coleccion(models.Model):
    """Agrupa PDFs de un mismo tema. Pertenece a un solo usuario."""

    propietario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="colecciones"
    )
    nombre = models.CharField(max_length=120)
    descripcion = models.TextField(blank=True)
    creada = models.DateTimeField(auto_now_add=True)
    actualizada = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "colección"
        verbose_name_plural = "colecciones"
        ordering = ["-actualizada"]
        constraints = [
            # Un usuario no puede tener dos colecciones con el mismo nombre,
            # sin importar mayúsculas ("Tesis" y "tesis" chocan).
            models.UniqueConstraint(
                Lower("nombre"), "propietario", name="coleccion_nombre_unico_por_usuario"
            ),
        ]

    def __str__(self):
        return self.nombre


def ruta_documento(documento, nombre_archivo):
    """
    Guarda cada PDF con un nombre aleatorio dentro de la carpeta de su dueño.
    El nombre original se conserva en la base de datos, no en el disco: así
    evitamos choques de nombres y caracteres problemáticos.
    """
    return f"documentos/{documento.coleccion.propietario_id}/{uuid.uuid4().hex}.pdf"


class Documento(models.Model):
    class Estado(models.TextChoices):
        # En la fase 2 el procesamiento moverá el estado de pendiente a listo
        PENDIENTE = "pendiente", "Pendiente"
        PROCESANDO = "procesando", "Procesando"
        LISTO = "listo", "Listo"
        ERROR = "error", "Error"

    coleccion = models.ForeignKey(Coleccion, on_delete=models.CASCADE, related_name="documentos")
    archivo = models.FileField(upload_to=ruta_documento)
    nombre_original = models.CharField(max_length=255)
    tamano_bytes = models.PositiveBigIntegerField()
    num_paginas = models.PositiveIntegerField()
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PENDIENTE)
    subido = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "documento"
        verbose_name_plural = "documentos"
        ordering = ["-subido"]

    def __str__(self):
        return self.nombre_original

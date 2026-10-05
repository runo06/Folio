from django.db import models

from biblioteca.models import Coleccion


class Conversacion(models.Model):
    """Una serie de preguntas y respuestas sobre una colección."""

    coleccion = models.ForeignKey(Coleccion, on_delete=models.CASCADE, related_name="conversaciones")
    titulo = models.CharField(max_length=120)
    creada = models.DateTimeField(auto_now_add=True)
    actualizada = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "conversación"
        verbose_name_plural = "conversaciones"
        # El id desempata si dos se actualizaron en el mismo instante
        ordering = ["-actualizada", "-id"]

    def __str__(self):
        return self.titulo


class Mensaje(models.Model):
    class Rol(models.TextChoices):
        USUARIO = "usuario", "Usuario"
        ASISTENTE = "asistente", "Asistente"

    conversacion = models.ForeignKey(Conversacion, on_delete=models.CASCADE, related_name="mensajes")
    rol = models.CharField(max_length=10, choices=Rol.choices)
    contenido = models.TextField()
    # Solo en respuestas: [{numero, documento_id, documento, pagina, extracto}, ...]
    citas = models.JSONField(default=list, blank=True)
    # La respuesta dice que no encontró la información en los documentos
    sin_respuesta = models.BooleanField(default=False)
    # La respuesta se cortó (el usuario la detuvo o falló a medias)
    interrumpida = models.BooleanField(default=False)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "mensaje"
        verbose_name_plural = "mensajes"
        ordering = ["creado", "id"]

    def __str__(self):
        return f"{self.get_rol_display()}: {self.contenido[:60]}"

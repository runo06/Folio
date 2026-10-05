from django.db import models
from pgvector.django import HnswIndex, VectorField

from biblioteca.models import Documento

from .embeddings import DIMENSIONES


class Fragmento(models.Model):
    """Un trozo de texto de una página, con su embedding."""

    documento = models.ForeignKey(Documento, on_delete=models.CASCADE, related_name="fragmentos")
    pagina = models.PositiveIntegerField()
    orden = models.PositiveIntegerField()  # posición dentro del documento
    texto = models.TextField()
    embedding = VectorField(dimensions=DIMENSIONES)
    # Vectores de modelos distintos no se pueden comparar: guardamos cuál fue
    modelo_embedding = models.CharField(max_length=80)

    class Meta:
        verbose_name = "fragmento"
        verbose_name_plural = "fragmentos"
        ordering = ["documento", "orden"]
        constraints = [
            models.UniqueConstraint(fields=["documento", "orden"], name="fragmento_orden_unico"),
        ]
        indexes = [
            # Índice HNSW: un "grafo" de vecinos que permite encontrar los
            # vectores más cercanos sin comparar contra todos (fase 3).
            HnswIndex(
                name="fragmento_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self):
        return f"{self.documento} · p. {self.pagina} · #{self.orden}"

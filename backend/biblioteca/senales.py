from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Documento


@receiver(post_delete, sender=Documento)
def borrar_archivo_del_disco(sender, instance, **kwargs):
    """
    Django borra la fila, pero no el archivo. Esta señal lo hace.
    También se dispara cuando se borra una colección completa (en cascada).
    Esperamos a que la transacción se confirme: si algo falla y se revierte,
    el archivo sigue ahí.
    """
    if instance.archivo:
        archivo = instance.archivo
        transaction.on_commit(lambda: archivo.storage.delete(archivo.name))

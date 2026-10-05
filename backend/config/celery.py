"""
Aplicación de Celery.

Celery es un sistema de tareas en segundo plano:
  - El backend (Django) deja encargos en una cola (Redis).
  - Un proceso aparte, el "worker", los toma y los ejecuta.
Así la petición de subida responde al instante aunque procesar el PDF
tarde minutos.
"""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("folio")

# Lee de settings.py todas las variables que empiezan con CELERY_
app.config_from_object("django.conf:settings", namespace="CELERY")

# Busca un archivo tasks.py en cada app instalada
app.autodiscover_tasks()

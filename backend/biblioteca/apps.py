from django.apps import AppConfig


class BibliotecaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "biblioteca"
    verbose_name = "Biblioteca"

    def ready(self):
        # Registra las señales (borrado de archivos del disco)
        from . import senales  # noqa: F401

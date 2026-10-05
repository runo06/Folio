from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class GestorUsuarios(BaseUserManager):
    """Crea usuarios identificados por correo en lugar de nombre de usuario."""

    use_in_migrations = True

    def _crear(self, email, password, **campos):
        if not email:
            raise ValueError("El correo es obligatorio")
        usuario = self.model(email=self.normalize_email(email), **campos)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_user(self, email, password=None, **campos):
        campos.setdefault("is_staff", False)
        campos.setdefault("is_superuser", False)
        return self._crear(email, password, **campos)

    def create_superuser(self, email, password=None, **campos):
        campos.setdefault("is_staff", True)
        campos.setdefault("is_superuser", True)
        return self._crear(email, password, **campos)


class Usuario(AbstractUser):
    """Usuario de Folio: entra con correo y contraseña."""

    username = None
    first_name = None
    last_name = None
    email = models.EmailField("correo", unique=True)
    nombre = models.CharField(max_length=150, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = GestorUsuarios()

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def __str__(self):
        return self.email

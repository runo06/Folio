"""
Configuración de Django para Folio.

Todo lo sensible o que cambia entre entornos (claves, contraseñas, modo
debug) se lee de variables de entorno. Docker Compose las carga desde .env.
"""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def variable_entorno(nombre, por_defecto=None):
    """Lee una variable de entorno; si falta y no hay valor por defecto, falla."""
    valor = os.environ.get(nombre, por_defecto)
    if valor is None:
        raise ImproperlyConfigured(f"Falta la variable de entorno {nombre}")
    return valor


def variable_booleana(nombre, por_defecto="False"):
    return variable_entorno(nombre, por_defecto).lower() in ("true", "1", "si", "sí")


SECRET_KEY = variable_entorno("DJANGO_SECRET_KEY")
DEBUG = variable_booleana("DJANGO_DEBUG")
ALLOWED_HOSTS = variable_entorno("DJANGO_ALLOWED_HOSTS", "localhost").split(",")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "cuentas",
    "biblioteca",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": variable_entorno("POSTGRES_DB"),
        "USER": variable_entorno("POSTGRES_USER"),
        "PASSWORD": variable_entorno("POSTGRES_PASSWORD"),
        "HOST": variable_entorno("POSTGRES_HOST", "localhost"),
        "PORT": variable_entorno("POSTGRES_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "cuentas.Usuario"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


LANGUAGE_CODE = "es"
# Las fechas se guardan en UTC; el navegador las muestra en la hora local
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# Los PDF se guardan aquí, pero NO se publican en una URL: solo se
# entregan a través de un endpoint que comprueba quién es el dueño.
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --- Django REST Framework ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        *(["rest_framework.renderers.BrowsableAPIRenderer"] if DEBUG else []),
    ],
}


# --- JWT ---
# El token de acceso dura poco y viaja en la cabecera Authorization.
# El de refresco dura más y viaja en una cookie httpOnly (JavaScript no
# puede leerla). Cada vez que se usa, se cambia por uno nuevo y el viejo
# entra a una lista negra.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

JWT_COOKIE_NOMBRE = "folio_refresco"
JWT_COOKIE_RUTA = "/api/auth/"
JWT_COOKIE_SEGURA = variable_booleana("JWT_COOKIE_SEGURA")


# --- Límites de Folio ---
FOLIO_TAMANO_MAXIMO_PDF = int(variable_entorno("FOLIO_TAMANO_MAXIMO_MB", "25")) * 1024 * 1024
FOLIO_MAX_DOCUMENTOS_POR_USUARIO = int(variable_entorno("FOLIO_MAX_DOCUMENTOS_POR_USUARIO", "50"))

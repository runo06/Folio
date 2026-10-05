"""
Autenticación con JWT.

- El token de ACCESO se devuelve en el cuerpo de la respuesta. El frontend
  lo guarda solo en memoria y lo manda en la cabecera Authorization.
- El token de REFRESCO se guarda en una cookie httpOnly. El navegador la
  envía sola a /api/auth/ y JavaScript no puede leerla, así que un script
  malicioso inyectado en la página no puede robarla.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegistroSerializer, UsuarioSerializer


def poner_cookie_refresco(respuesta, refresco):
    respuesta.set_cookie(
        settings.JWT_COOKIE_NOMBRE,
        str(refresco),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.JWT_COOKIE_SEGURA,
        samesite="Lax",
        path=settings.JWT_COOKIE_RUTA,
    )


def borrar_cookie_refresco(respuesta):
    respuesta.delete_cookie(settings.JWT_COOKIE_NOMBRE, path=settings.JWT_COOKIE_RUTA, samesite="Lax")


def respuesta_con_sesion(usuario, estado=status.HTTP_200_OK):
    """Crea los dos tokens del usuario y arma la respuesta de sesión iniciada."""
    refresco = RefreshToken.for_user(usuario)
    respuesta = Response(
        {"acceso": str(refresco.access_token), "usuario": UsuarioSerializer(usuario).data},
        status=estado,
    )
    poner_cookie_refresco(respuesta, refresco)
    return respuesta


class RegistroVista(APIView):
    """Crea la cuenta y deja la sesión iniciada."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegistroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        usuario = serializer.save()
        return respuesta_con_sesion(usuario, status.HTTP_201_CREATED)


class InicioSesionVista(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        datos = request.data.copy()
        datos["email"] = str(datos.get("email", "")).strip().lower()
        serializer = TokenObtainPairSerializer(data=datos)
        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            return Response({"detail": "Correo o contraseña incorrectos."}, status=status.HTTP_401_UNAUTHORIZED)
        return respuesta_con_sesion(serializer.user)


class RefrescarVista(APIView):
    """Usa la cookie de refresco para entregar un token de acceso nuevo."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresco = request.COOKIES.get(settings.JWT_COOKIE_NOMBRE)
        if not refresco:
            return Response({"detail": "No hay sesión."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={"refresh": refresco})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            respuesta = Response({"detail": "La sesión expiró."}, status=status.HTTP_401_UNAUTHORIZED)
            borrar_cookie_refresco(respuesta)
            return respuesta

        respuesta = Response({"acceso": serializer.validated_data["access"]})
        # Con ROTATE_REFRESH_TOKENS también llega un token de refresco nuevo
        poner_cookie_refresco(respuesta, serializer.validated_data["refresh"])
        return respuesta


class CerrarSesionVista(APIView):
    """Invalida el token de refresco (lista negra) y borra la cookie."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresco = request.COOKIES.get(settings.JWT_COOKIE_NOMBRE)
        if refresco:
            try:
                RefreshToken(refresco).blacklist()
            except TokenError:
                pass  # ya era inválido: no hay nada que invalidar
        respuesta = Response(status=status.HTTP_204_NO_CONTENT)
        borrar_cookie_refresco(respuesta)
        return respuesta


class YoVista(APIView):
    def get(self, request):
        return Response(UsuarioSerializer(request.user).data)

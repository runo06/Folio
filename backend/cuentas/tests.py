from django.conf import settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Usuario

COOKIE = settings.JWT_COOKIE_NOMBRE
CONTRASENA = "unaClaveSegura-2026"


class RegistroTests(APITestCase):
    def test_registro_crea_cuenta_e_inicia_sesion(self):
        respuesta = self.client.post(
            reverse("registro"),
            {"email": "Ana@Correo.com", "nombre": "Ana", "password": CONTRASENA},
        )
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertIn("acceso", respuesta.data)
        self.assertEqual(respuesta.data["usuario"]["email"], "ana@correo.com")
        self.assertNotIn("password", respuesta.data["usuario"])
        self.assertTrue(respuesta.cookies[COOKIE]["httponly"])
        self.assertTrue(Usuario.objects.filter(email="ana@correo.com").exists())

    def test_correo_repetido_sin_importar_mayusculas(self):
        Usuario.objects.create_user("ana@correo.com", CONTRASENA)
        respuesta = self.client.post(
            reverse("registro"), {"email": "ANA@correo.com", "password": CONTRASENA}
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", respuesta.data)

    def test_contrasena_debil_se_rechaza(self):
        respuesta = self.client.post(reverse("registro"), {"email": "ana@correo.com", "password": "123"})
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Usuario.objects.exists())


class SesionTests(APITestCase):
    def setUp(self):
        self.usuario = Usuario.objects.create_user("ana@correo.com", CONTRASENA, nombre="Ana")

    def iniciar_sesion(self, email="ana@correo.com", password=CONTRASENA):
        return self.client.post(reverse("inicio-sesion"), {"email": email, "password": password})

    def test_inicio_sesion_correcto(self):
        respuesta = self.iniciar_sesion(email="  ANA@correo.com ")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("acceso", respuesta.data)
        self.assertIn(COOKIE, respuesta.cookies)
        # El token de refresco nunca va en el cuerpo, solo en la cookie
        self.assertNotIn("refresco", respuesta.data)

    def test_contrasena_incorrecta(self):
        respuesta = self.iniciar_sesion(password="otra-cosa")
        self.assertEqual(respuesta.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn(COOKIE, respuesta.cookies)

    def test_yo_requiere_token(self):
        self.assertEqual(self.client.get(reverse("yo")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_yo_con_token(self):
        acceso = self.iniciar_sesion().data["acceso"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {acceso}")
        respuesta = self.client.get(reverse("yo"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["email"], "ana@correo.com")

    def test_refrescar_con_cookie_entrega_acceso_nuevo(self):
        self.iniciar_sesion()  # el cliente de pruebas guarda la cookie
        respuesta = self.client.post(reverse("refrescar"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("acceso", respuesta.data)
        self.assertIn(COOKIE, respuesta.cookies)

    def test_refrescar_sin_cookie(self):
        self.assertEqual(self.client.post(reverse("refrescar")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_de_refresco_viejo_no_sirve_tras_rotar(self):
        refresco_viejo = self.iniciar_sesion().cookies[COOKIE].value
        self.client.post(reverse("refrescar"))
        self.client.cookies[COOKIE] = refresco_viejo
        self.assertEqual(self.client.post(reverse("refrescar")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cerrar_sesion_invalida_el_refresco(self):
        refresco = self.iniciar_sesion().cookies[COOKIE].value
        respuesta = self.client.post(reverse("cerrar-sesion"))
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        # Aunque alguien hubiera copiado la cookie, ya no sirve
        self.client.cookies[COOKIE] = refresco
        self.assertEqual(self.client.post(reverse("refrescar")).status_code, status.HTTP_401_UNAUTHORIZED)

import io
import shutil
import tempfile

from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from pypdf import PdfWriter
from rest_framework import status
from rest_framework.test import APITestCase

from cuentas.models import Usuario

from .models import Coleccion, Documento


def crear_pdf(paginas=1, contrasena=None, solo_permisos=False):
    """Genera un PDF real en memoria, con páginas en blanco."""
    escritor = PdfWriter()
    for _ in range(paginas):
        escritor.add_blank_page(width=595, height=842)  # tamaño A4 en puntos
    if contrasena:
        escritor.encrypt(user_password=contrasena, owner_password=contrasena, algorithm="AES-128")
    elif solo_permisos:
        # Se abre sin contraseña, pero tiene restricciones de dueño
        escritor.encrypt(user_password="", owner_password="duenio", algorithm="AES-128")
    salida = io.BytesIO()
    escritor.write(salida)
    return salida.getvalue()


def archivo_subido(contenido, nombre="documento.pdf"):
    return SimpleUploadedFile(nombre, contenido, content_type="application/pdf")


class BaseTests(APITestCase):
    """Cada prueba guarda sus archivos en una carpeta temporal que luego se borra."""

    def setUp(self):
        self.carpeta_temporal = tempfile.mkdtemp()
        ajustes = override_settings(MEDIA_ROOT=self.carpeta_temporal)
        ajustes.enable()
        self.addCleanup(ajustes.disable)
        self.addCleanup(shutil.rmtree, self.carpeta_temporal, ignore_errors=True)

        self.ana = Usuario.objects.create_user("ana@correo.com", "clave-de-ana-2026")
        self.beto = Usuario.objects.create_user("beto@correo.com", "clave-de-beto-2026")
        self.client.force_authenticate(self.ana)

    def como(self, usuario):
        self.client.force_authenticate(usuario)

    def subir(self, coleccion, contenido, nombre="documento.pdf"):
        return self.client.post(
            reverse("coleccion-documentos", args=[coleccion.pk]),
            {"archivo": archivo_subido(contenido, nombre)},
            format="multipart",
        )


class ColeccionTests(BaseTests):
    def test_crear_y_listar(self):
        respuesta = self.client.post(reverse("coleccion-list"), {"nombre": "  Tesis  "})
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(respuesta.data["nombre"], "Tesis")

        lista = self.client.get(reverse("coleccion-list")).data
        self.assertEqual(len(lista), 1)
        self.assertEqual(lista[0]["total_documentos"], 0)

    def test_lista_la_mas_reciente_primero(self):
        Coleccion.objects.create(propietario=self.ana, nombre="Vieja")
        Coleccion.objects.create(propietario=self.ana, nombre="Nueva")
        nombres = [c["nombre"] for c in self.client.get(reverse("coleccion-list")).data]
        self.assertEqual(nombres, ["Nueva", "Vieja"])

    def test_requiere_sesion(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse("coleccion-list")).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nombre_repetido_sin_importar_mayusculas(self):
        Coleccion.objects.create(propietario=self.ana, nombre="Tesis")
        respuesta = self.client.post(reverse("coleccion-list"), {"nombre": "TESIS"})
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_otro_usuario_puede_usar_el_mismo_nombre(self):
        Coleccion.objects.create(propietario=self.beto, nombre="Tesis")
        respuesta = self.client.post(reverse("coleccion-list"), {"nombre": "Tesis"})
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)

    def test_renombrar(self):
        coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")
        respuesta = self.client.patch(reverse("coleccion-detail", args=[coleccion.pk]), {"nombre": "Tesis final"})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        coleccion.refresh_from_db()
        self.assertEqual(coleccion.nombre, "Tesis final")

    def test_renombrar_con_su_mismo_nombre_no_choca(self):
        coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")
        respuesta = self.client.patch(reverse("coleccion-detail", args=[coleccion.pk]), {"nombre": "tesis"})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

    def test_borrar(self):
        coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")
        respuesta = self.client.delete(reverse("coleccion-detail", args=[coleccion.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Coleccion.objects.exists())

    def test_no_ve_ni_toca_colecciones_ajenas(self):
        ajena = Coleccion.objects.create(propietario=self.beto, nombre="Privada")
        url = reverse("coleccion-detail", args=[ajena.pk])

        self.assertEqual(self.client.get(reverse("coleccion-list")).data, [])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.patch(url, {"nombre": "Mía"}).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Coleccion.objects.filter(pk=ajena.pk, nombre="Privada").exists())


class SubidaTests(BaseTests):
    def setUp(self):
        super().setUp()
        self.coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")

    def test_sube_pdf_valido(self):
        contenido = crear_pdf(paginas=3)
        respuesta = self.subir(self.coleccion, contenido, "Capítulo 1.pdf")

        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(respuesta.data["nombre_original"], "Capítulo 1.pdf")
        self.assertEqual(respuesta.data["num_paginas"], 3)
        self.assertEqual(respuesta.data["tamano_bytes"], len(contenido))
        self.assertEqual(respuesta.data["estado"], "pendiente")
        documento = Documento.objects.get()
        self.assertTrue(default_storage.exists(documento.archivo.name))
        # En disco se guarda con nombre aleatorio, no con el original
        self.assertNotIn("Capítulo", documento.archivo.name)

    def test_acepta_pdf_con_solo_restricciones_de_dueno(self):
        respuesta = self.subir(self.coleccion, crear_pdf(paginas=2, solo_permisos=True))
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(respuesta.data["num_paginas"], 2)

    def test_rechaza_texto_renombrado_a_pdf(self):
        respuesta = self.subir(self.coleccion, b"Hola, no soy un PDF", "falso.pdf")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("archivo", respuesta.data)
        self.assertFalse(Documento.objects.exists())

    def test_rechaza_pdf_danado(self):
        respuesta = self.subir(self.coleccion, b"%PDF-1.7\n" + b"basura" * 200, "roto.pdf")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_otra_extension(self):
        respuesta = self.subir(self.coleccion, crear_pdf(), "documento.txt")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rechaza_pdf_con_contrasena(self):
        respuesta = self.subir(self.coleccion, crear_pdf(contrasena="secreta"))
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contraseña", str(respuesta.data["archivo"][0]))

    @override_settings(FOLIO_TAMANO_MAXIMO_PDF=1024)
    def test_rechaza_pdf_demasiado_grande(self):
        # Bajamos el límite a 1 KB para no generar 25 MB en la prueba
        respuesta = self.subir(self.coleccion, crear_pdf(paginas=20))
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(FOLIO_MAX_DOCUMENTOS_POR_USUARIO=1)
    def test_limite_de_documentos_por_usuario(self):
        self.assertEqual(self.subir(self.coleccion, crear_pdf()).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.subir(self.coleccion, crear_pdf()).status_code, status.HTTP_400_BAD_REQUEST)

    def test_lista_documentos_y_totales_en_coleccion(self):
        self.subir(self.coleccion, crear_pdf(paginas=2))
        self.subir(self.coleccion, crear_pdf(paginas=5))
        lista = self.client.get(reverse("coleccion-documentos", args=[self.coleccion.pk])).data
        self.assertEqual(len(lista), 2)
        detalle = self.client.get(reverse("coleccion-detail", args=[self.coleccion.pk])).data
        self.assertEqual(detalle["total_documentos"], 2)
        self.assertEqual(detalle["total_paginas"], 7)
        self.assertEqual(sorted(detalle["paginas_por_documento"]), [2, 5])


class DocumentoTests(BaseTests):
    def setUp(self):
        super().setUp()
        self.coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")
        self.contenido = crear_pdf(paginas=2)
        respuesta = self.subir(self.coleccion, self.contenido, "tesis.pdf")
        self.documento = Documento.objects.get(pk=respuesta.data["id"])

    def test_abrir_pdf_propio(self):
        respuesta = self.client.get(reverse("documento-archivo", args=[self.documento.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta["Content-Type"], "application/pdf")
        self.assertIn("inline", respuesta["Content-Disposition"])
        self.assertEqual(b"".join(respuesta.streaming_content), self.contenido)

    def test_borrar_documento_borra_el_archivo(self):
        ruta = self.documento.archivo.name
        with self.captureOnCommitCallbacks(execute=True):
            respuesta = self.client.delete(reverse("documento-detail", args=[self.documento.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Documento.objects.exists())
        self.assertFalse(default_storage.exists(ruta))

    def test_borrar_coleccion_borra_sus_archivos(self):
        ruta = self.documento.archivo.name
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("coleccion-detail", args=[self.coleccion.pk]))
        self.assertFalse(default_storage.exists(ruta))

    def test_otro_usuario_no_puede_ver_abrir_ni_borrar(self):
        self.como(self.beto)
        rutas = [
            reverse("documento-detail", args=[self.documento.pk]),
            reverse("documento-archivo", args=[self.documento.pk]),
            reverse("coleccion-documentos", args=[self.coleccion.pk]),
        ]
        for ruta in rutas:
            with self.subTest(ruta=ruta):
                self.assertEqual(self.client.get(ruta).status_code, status.HTTP_404_NOT_FOUND)

        self.assertEqual(
            self.client.delete(reverse("documento-detail", args=[self.documento.pk])).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertTrue(Documento.objects.filter(pk=self.documento.pk).exists())

    def test_otro_usuario_no_puede_subir_a_coleccion_ajena(self):
        self.como(self.beto)
        respuesta = self.subir(self.coleccion, crear_pdf())
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Documento.objects.count(), 1)

    def test_sin_sesion_no_se_puede_abrir(self):
        self.client.force_authenticate(None)
        respuesta = self.client.get(reverse("documento-archivo", args=[self.documento.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_401_UNAUTHORIZED)

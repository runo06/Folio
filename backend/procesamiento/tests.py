import io
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from fpdf import FPDF
from rest_framework import status

from biblioteca.models import Coleccion, Documento
from biblioteca.tests import BaseTests, crear_pdf
from config.celery import app as celery_app

from .embeddings import DIMENSIONES, ErrorEmbeddings, ErrorTemporal, generar_embeddings, normalizar
from .extraccion import extraer_paginas, limpiar_texto, tiene_texto
from .fragmentacion import fragmentar_paginas, fragmentar_texto
from .models import Fragmento
from .tasks import MENSAJE_LIMITE, MENSAJE_SIN_TEXTO, MAXIMO_REINTENTOS

PARRAFO = (
    "La metodología mixta combina técnicas cualitativas y cuantitativas. "
    "Primero se realizan entrevistas para definir categorías. "
    "Después se aplica una encuesta para medir su frecuencia en la población. "
)


def crear_pdf_con_texto(paginas):
    """PDF real con texto; una cadena vacía produce una página en blanco (como un escaneo)."""
    pdf = FPDF()
    pdf.set_font("Helvetica", size=11)
    for texto in paginas:
        pdf.add_page()
        if texto:
            pdf.multi_cell(0, 6, texto)
    return bytes(pdf.output())


class ProveedorFalso:
    """Imita a Gemini: devuelve vectores fijos y puede simular fallas."""

    def __init__(self, fallas_temporales=0, error=None):
        self.fallas_temporales = fallas_temporales
        self.error = error
        self.lotes = []

    def embeber(self, textos, tarea="documento"):
        self.lotes.append(len(textos))
        if self.fallas_temporales:
            self.fallas_temporales -= 1
            raise ErrorTemporal("Gemini respondió 429")
        if self.error:
            raise self.error
        return [normalizar([float(len(texto)), 1.0] + [0.0] * (DIMENSIONES - 2)) for texto in textos]


# ---------------------------------------------------------------- unidades


class LimpiezaTests(SimpleTestCase):
    def test_une_palabras_cortadas_y_quita_espacios(self):
        texto = "El conoci-\nmiento   se\x00 construye.\n\n\n\nOtro  párrafo."
        self.assertEqual(limpiar_texto(texto), "El conocimiento se construye.\n\nOtro párrafo.")

    def test_tiene_texto(self):
        self.assertFalse(tiene_texto(""))
        self.assertFalse(tiene_texto(" . - "))
        self.assertTrue(tiene_texto("Capítulo 2"))


class FragmentacionTests(SimpleTestCase):
    def test_texto_corto_es_un_solo_fragmento(self):
        self.assertEqual(fragmentar_texto("Hola mundo.", 1200, 200), ["Hola mundo."])

    def test_ningun_fragmento_supera_el_tamano(self):
        texto = "\n\n".join(PARRAFO * 4 for _ in range(10))
        fragmentos = fragmentar_texto(texto, 500, 100)
        self.assertGreater(len(fragmentos), 5)
        self.assertTrue(all(len(f) <= 500 for f in fragmentos))

    def test_fragmentos_consecutivos_se_solapan(self):
        fragmentos = fragmentar_texto(PARRAFO * 12, 400, 120)
        for anterior, siguiente in zip(fragmentos, fragmentos[1:]):
            # El inicio del siguiente aparece al final del anterior
            self.assertIn(siguiente[:40], anterior)

    def test_no_se_pierde_texto(self):
        texto = PARRAFO * 12
        fragmentos = fragmentar_texto(texto, 400, 120)
        for oracion in [o.strip() for o in texto.split(". ") if o.strip()]:
            self.assertTrue(any(oracion in f for f in fragmentos), oracion)

    def test_palabra_gigante_se_corta_por_caracteres(self):
        fragmentos = fragmentar_texto("x" * 2500, 1000, 100)
        self.assertTrue(all(len(f) <= 1000 for f in fragmentos))
        self.assertEqual(sum(len(f) for f in fragmentos), 2500)

    def test_nunca_cruza_de_pagina_y_numera_en_orden(self):
        paginas = [(1, PARRAFO * 6), (2, "Solo una línea."), (5, PARRAFO * 6)]
        fragmentos = fragmentar_paginas(paginas, 400, 100)
        self.assertEqual([f.orden for f in fragmentos], list(range(len(fragmentos))))
        self.assertEqual({f.pagina for f in fragmentos}, {1, 2, 5})
        self.assertIn(fragmentos[0].pagina, [1])
        pagina_dos = [f for f in fragmentos if f.pagina == 2]
        self.assertEqual([f.texto for f in pagina_dos], ["Solo una línea."])

    def test_solape_debe_ser_menor_que_tamano(self):
        with self.assertRaises(ValueError):
            fragmentar_texto("hola", 100, 100)


class ExtraccionTests(SimpleTestCase):
    def test_extrae_por_pagina_y_detecta_paginas_vacias(self):
        contenido = crear_pdf_con_texto(["Introduccion a la tesis.", "", "Conclusiones finales."])
        paginas = extraer_paginas(io.BytesIO(contenido))
        self.assertEqual([numero for numero, _ in paginas], [1, 2, 3])
        self.assertIn("Introduccion", paginas[0][1])
        self.assertFalse(tiene_texto(paginas[1][1]))
        self.assertIn("Conclusiones", paginas[2][1])


class EmbeddingsTests(SimpleTestCase):
    def test_normalizar_deja_norma_uno(self):
        vector = normalizar([3.0, 4.0])
        self.assertAlmostEqual(vector[0], 0.6)
        self.assertAlmostEqual(vector[1], 0.8)

    def test_pide_en_lotes_de_100_y_conserva_el_orden(self):
        proveedor = ProveedorFalso()
        textos = [f"texto {i}" * (i % 7 + 1) for i in range(250)]
        with patch("procesamiento.embeddings.obtener_proveedor", return_value=proveedor):
            vectores = generar_embeddings(textos)
        self.assertEqual(proveedor.lotes, [100, 100, 50])
        self.assertEqual(len(vectores), 250)
        self.assertEqual(vectores[3], ProveedorFalso().embeber([textos[3]])[0])

    @override_settings(GEMINI_API_KEY="")
    def test_sin_clave_da_un_error_claro(self):
        with self.assertRaisesMessage(ErrorEmbeddings, "GEMINI_API_KEY"):
            generar_embeddings(["hola"])


# ------------------------------------------------------- tarea completa


class ProcesamientoTests(BaseTests):
    def setUp(self):
        super().setUp()
        # "Eager": la tarea corre en el mismo proceso, sin Redis ni worker
        celery_app.conf.task_always_eager = True
        self.addCleanup(setattr, celery_app.conf, "task_always_eager", False)
        self.coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Tesis")

    def subir_y_procesar(self, contenido, proveedor):
        with patch("procesamiento.embeddings.obtener_proveedor", return_value=proveedor):
            # Ejecuta lo que se encola "al confirmar la transacción"
            with self.captureOnCommitCallbacks(execute=True):
                respuesta = self.subir(self.coleccion, contenido)
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        return Documento.objects.get(pk=respuesta.data["id"])

    def test_documento_con_texto_queda_listo_con_fragmentos(self):
        contenido = crear_pdf_con_texto([PARRAFO * 10, PARRAFO * 3])
        documento = self.subir_y_procesar(contenido, ProveedorFalso())

        self.assertEqual(documento.estado, Documento.Estado.LISTO)
        self.assertEqual(documento.mensaje_error, "")
        self.assertEqual(documento.paginas_sin_texto, [])
        fragmentos = list(documento.fragmentos.all())
        self.assertGreaterEqual(len(fragmentos), 2)
        self.assertEqual({f.pagina for f in fragmentos}, {1, 2})
        self.assertEqual(len(fragmentos[0].embedding), DIMENSIONES)
        self.assertEqual(fragmentos[0].modelo_embedding, "gemini-embedding-001")

    def test_pdf_escaneado_termina_en_error(self):
        documento = self.subir_y_procesar(crear_pdf(paginas=3), ProveedorFalso())
        self.assertEqual(documento.estado, Documento.Estado.ERROR)
        self.assertEqual(documento.mensaje_error, MENSAJE_SIN_TEXTO)
        self.assertFalse(Fragmento.objects.exists())

    def test_avisa_que_paginas_no_tienen_texto(self):
        contenido = crear_pdf_con_texto([PARRAFO, "", PARRAFO, ""])
        documento = self.subir_y_procesar(contenido, ProveedorFalso())
        self.assertEqual(documento.estado, Documento.Estado.LISTO)
        self.assertEqual(documento.paginas_sin_texto, [2, 4])

    def test_reintenta_cuando_gemini_pide_esperar(self):
        proveedor = ProveedorFalso(fallas_temporales=2)
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), proveedor)
        self.assertEqual(documento.estado, Documento.Estado.LISTO)
        self.assertEqual(len(proveedor.lotes), 3)  # 2 fallas + 1 éxito

    def test_si_se_agotan_los_reintentos_queda_en_error(self):
        proveedor = ProveedorFalso(fallas_temporales=100)
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), proveedor)
        self.assertEqual(documento.estado, Documento.Estado.ERROR)
        self.assertEqual(documento.mensaje_error, MENSAJE_LIMITE)
        self.assertEqual(len(proveedor.lotes), MAXIMO_REINTENTOS + 1)

    def test_error_permanente_muestra_su_mensaje(self):
        proveedor = ProveedorFalso(error=ErrorEmbeddings("La clave de Gemini no es válida."))
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), proveedor)
        self.assertEqual(documento.estado, Documento.Estado.ERROR)
        self.assertEqual(documento.mensaje_error, "La clave de Gemini no es válida.")

    def test_reprocesar_no_duplica_fragmentos(self):
        contenido = crear_pdf_con_texto([PARRAFO * 10])
        documento = self.subir_y_procesar(contenido, ProveedorFalso(error=ErrorEmbeddings("Falla.")))
        self.assertEqual(documento.estado, Documento.Estado.ERROR)

        url = reverse("documento-reprocesar", args=[documento.pk])
        for _ in range(2):
            with patch("procesamiento.embeddings.obtener_proveedor", return_value=ProveedorFalso()):
                with self.captureOnCommitCallbacks(execute=True):
                    respuesta = self.client.post(url)
            self.assertEqual(respuesta.status_code, status.HTTP_202_ACCEPTED)

        documento.refresh_from_db()
        self.assertEqual(documento.estado, Documento.Estado.LISTO)
        ordenes = list(documento.fragmentos.values_list("orden", flat=True))
        self.assertEqual(ordenes, list(range(len(ordenes))))

    def test_no_se_reprocesa_mientras_se_procesa(self):
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), ProveedorFalso())
        Documento.objects.filter(pk=documento.pk).update(estado=Documento.Estado.PROCESANDO)
        respuesta = self.client.post(reverse("documento-reprocesar", args=[documento.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_409_CONFLICT)

    def test_otro_usuario_no_puede_reprocesar(self):
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), ProveedorFalso())
        self.como(self.beto)
        respuesta = self.client.post(reverse("documento-reprocesar", args=[documento.pk]))
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_borrar_documento_borra_sus_fragmentos(self):
        documento = self.subir_y_procesar(crear_pdf_con_texto([PARRAFO]), ProveedorFalso())
        self.assertTrue(Fragmento.objects.exists())
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(reverse("documento-detail", args=[documento.pk]))
        self.assertFalse(Fragmento.objects.exists())

    def test_la_respuesta_incluye_estado_y_detalles(self):
        contenido = crear_pdf_con_texto([PARRAFO, ""])
        documento = self.subir_y_procesar(contenido, ProveedorFalso())
        datos = self.client.get(reverse("coleccion-documentos", args=[self.coleccion.pk])).data[0]
        self.assertEqual(datos["id"], documento.pk)
        self.assertEqual(datos["estado"], "listo")
        self.assertEqual(datos["paginas_sin_texto"], [2])
        self.assertEqual(datos["mensaje_error"], "")

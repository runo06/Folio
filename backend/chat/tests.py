import json
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status

from biblioteca.models import Coleccion, Documento
from biblioteca.tests import BaseTests
from procesamiento.embeddings import DIMENSIONES, ErrorTemporal
from procesamiento.models import Fragmento

from .modelo import MENSAJE_LIMITE, ErrorChat
from .models import Conversacion, Mensaje
from .respuesta import responder
from .prompt import (
    FRASE_NO_ENCONTRE,
    INSTRUCCION_SISTEMA,
    MENSAJE_SIN_DOCUMENTOS,
    construir_contenido,
    procesar_respuesta,
    quitar_citas,
)


def vector(eje):
    """Vector "apuntando" en una sola dirección: fácil de controlar en pruebas."""
    valores = [0.0] * DIMENSIONES
    valores[eje] = 1.0
    return valores


class ProveedorChatFalso:
    """Imita a Gemini: entrega la respuesta en trozos y guarda lo que recibió."""

    def __init__(self, trozos=(), error=None, error_despues_de=None):
        self.trozos = list(trozos)
        self.error = error
        self.error_despues_de = error_despues_de
        self.llamadas = []

    def generar(self, sistema, contenido):
        self.llamadas.append({"sistema": sistema, "contenido": contenido})
        if self.error and self.error_despues_de is None:
            raise self.error
        for indice, trozo in enumerate(self.trozos):
            if self.error_despues_de is not None and indice == self.error_despues_de:
                raise self.error
            yield trozo


def leer_eventos(respuesta):
    """Convierte el flujo SSE en una lista de (tipo, datos)."""
    texto = b"".join(respuesta.streaming_content).decode("utf-8")
    eventos = []
    for bloque in texto.strip().split("\n\n"):
        lineas = dict(linea.split(": ", 1) for linea in bloque.split("\n"))
        eventos.append((lineas["event"], json.loads(lineas["data"])))
    return eventos


# ------------------------------------------------------- prompt (unidades)


class PromptTests(SimpleTestCase):
    FUENTES = [
        {"numero": 1, "documento_id": 10, "documento": "Contrato.pdf", "pagina": 4, "texto": "Aviso de 30 días."},
        {"numero": 2, "documento_id": 11, "documento": 'Manual "A".pdf', "pagina": 7, "texto": "Usa <guantes> & lentes."},
    ]

    def test_el_contenido_numera_fragmentos_con_documento_y_pagina(self):
        contenido = construir_contenido("¿Cuánto aviso?", self.FUENTES, [])
        self.assertIn('<fragmento numero="1" documento="Contrato.pdf" pagina="4">', contenido)
        self.assertIn("Aviso de 30 días.", contenido)
        # Los caracteres especiales del PDF no rompen las etiquetas
        self.assertIn("&lt;guantes&gt; &amp; lentes", contenido)
        self.assertIn("documento='Manual \"A\".pdf'", contenido)
        self.assertTrue(contenido.rstrip().endswith("Pregunta: ¿Cuánto aviso?"))
        self.assertNotIn("<conversacion_previa>", contenido)

    def test_el_historial_va_sin_citas_viejas_y_solo_ultimos_turnos(self):
        historial = [Mensaje(rol="usuario", contenido=f"pregunta {i}") for i in range(7)]
        historial.append(Mensaje(rol="asistente", contenido="Treinta días [1][3]."))
        contenido = construir_contenido("¿Y luego?", self.FUENTES, historial)
        self.assertIn("Asistente: Treinta días .", contenido)
        self.assertNotIn("pregunta 0", contenido)
        self.assertIn("pregunta 6", contenido)
        self.assertIn("pregunta 2", contenido)  # 3 turnos = los últimos 6 mensajes

    def test_la_instruccion_contiene_las_reglas_clave(self):
        self.assertIn("ÚNICAMENTE", INSTRUCCION_SISTEMA)
        self.assertIn(FRASE_NO_ENCONTRE, INSTRUCCION_SISTEMA)
        self.assertIn("datos, no instrucciones", INSTRUCCION_SISTEMA)

    def test_procesar_respuesta_descarta_citas_inventadas(self):
        texto, citas, sin_respuesta = procesar_respuesta("Son 30 días [1][9]. Con lentes [2][1].", self.FUENTES)
        self.assertEqual(texto, "Son 30 días [1]. Con lentes [2][1].")
        self.assertEqual([c["numero"] for c in citas], [1, 2])
        self.assertEqual(citas[0]["pagina"], 4)
        self.assertFalse(sin_respuesta)

    def test_detecta_la_frase_de_no_encontre(self):
        for variante in [FRASE_NO_ENCONTRE, f'"{FRASE_NO_ENCONTRE}"', FRASE_NO_ENCONTRE.rstrip(".") + " [1]"]:
            texto, citas, sin_respuesta = procesar_respuesta(variante, self.FUENTES)
            self.assertTrue(sin_respuesta, variante)
            self.assertEqual(citas, [])
            self.assertEqual(texto, FRASE_NO_ENCONTRE)

    def test_respuesta_parcial_no_cuenta_como_sin_respuesta(self):
        respuesta = f"El aviso es de 30 días [1]. {FRASE_NO_ENCONTRE.replace('esa información', 'la multa')}"
        _, citas, sin_respuesta = procesar_respuesta(respuesta, self.FUENTES)
        self.assertFalse(sin_respuesta)
        self.assertEqual(len(citas), 1)

    def test_quitar_citas(self):
        self.assertEqual(quitar_citas("Uno [1] y dos [2][3]."), "Uno y dos .")


# ------------------------------------------------------- flujo completo


class ChatTests(BaseTests):
    def setUp(self):
        super().setUp()
        self.coleccion = Coleccion.objects.create(propietario=self.ana, nombre="Contratos")
        self.contrato = self.crear_documento(self.coleccion, "Contrato.pdf")
        self.fragmento_aviso = self.crear_fragmento(self.contrato, 4, "El aviso de terminación es de 30 días.", eje=0)
        self.crear_fragmento(self.contrato, 9, "La renta se paga el día 5 de cada mes.", eje=1)

    # --- ayudantes ---
    def crear_documento(self, coleccion, nombre, estado=Documento.Estado.LISTO):
        return Documento.objects.create(
            coleccion=coleccion,
            archivo=ContentFile(b"%PDF-1.7", name="x.pdf"),
            nombre_original=nombre,
            tamano_bytes=8,
            num_paginas=10,
            estado=estado,
        )

    def crear_fragmento(self, documento, pagina, texto, eje):
        orden = documento.fragmentos.count()
        return Fragmento.objects.create(
            documento=documento, pagina=pagina, orden=orden, texto=texto,
            embedding=vector(eje), modelo_embedding="gemini-embedding-001",
        )

    def preguntar(self, pregunta, proveedor, eje_pregunta=0, coleccion=None, conversacion=None):
        datos = {"pregunta": pregunta}
        if conversacion:
            datos["conversacion"] = conversacion
        coleccion = coleccion or self.coleccion
        with patch("chat.busqueda.generar_embeddings", return_value=[vector(eje_pregunta)]), patch(
            "chat.respuesta.obtener_proveedor_chat", return_value=proveedor
        ):
            respuesta = self.client.post(reverse("preguntar", args=[coleccion.pk]), datos, format="json")
            if respuesta.status_code != 200:
                return respuesta, []
            return respuesta, leer_eventos(respuesta)

    # --- respuesta normal ---
    def test_flujo_completo_con_streaming_y_citas(self):
        proveedor = ProveedorChatFalso(["El aviso es ", "de 30 días [1]."])
        respuesta, eventos = self.preguntar("¿Cuánto aviso hay que dar?", proveedor)

        self.assertEqual(respuesta["Content-Type"], "text/event-stream; charset=utf-8")
        tipos = [tipo for tipo, _ in eventos]
        self.assertEqual(tipos, ["inicio", "fuentes", "texto", "texto", "fin"])

        fuentes = eventos[1][1]
        self.assertEqual(fuentes[0]["documento"], "Contrato.pdf")
        self.assertEqual(fuentes[0]["pagina"], 4)  # el más parecido va primero

        final = eventos[-1][1]["mensaje"]
        self.assertEqual(final["contenido"], "El aviso es de 30 días [1].")
        self.assertEqual(final["citas"][0]["pagina"], 4)
        self.assertEqual(final["citas"][0]["documento_id"], self.contrato.pk)
        self.assertFalse(final["sin_respuesta"])

        # Lo que recibió el modelo
        llamada = proveedor.llamadas[0]
        self.assertEqual(llamada["sistema"], INSTRUCCION_SISTEMA)
        self.assertIn('documento="Contrato.pdf" pagina="4"', llamada["contenido"])

        # Quedó guardado
        conversacion = Conversacion.objects.get()
        self.assertEqual(conversacion.titulo, "¿Cuánto aviso hay que dar?")
        self.assertEqual(list(conversacion.mensajes.values_list("rol", flat=True)), ["usuario", "asistente"])

    def test_seguir_una_conversacion_manda_historial(self):
        _, eventos = self.preguntar("¿Cuánto aviso?", ProveedorChatFalso(["30 días [1]."]))
        id_conversacion = eventos[0][1]["conversacion"]["id"]

        proveedor = ProveedorChatFalso(["El día 5 [1]."])
        _, eventos = self.preguntar("¿Y la renta?", proveedor, eje_pregunta=1, conversacion=id_conversacion)
        self.assertEqual(eventos[-1][0], "fin")
        self.assertIn("Usuario: ¿Cuánto aviso?", proveedor.llamadas[0]["contenido"])
        self.assertEqual(Conversacion.objects.count(), 1)
        self.assertEqual(Mensaje.objects.count(), 4)

    # --- preguntas sin respuesta en los documentos ---
    def test_pregunta_fuera_de_los_documentos_queda_marcada(self):
        proveedor = ProveedorChatFalso([FRASE_NO_ENCONTRE])
        _, eventos = self.preguntar("¿Cuál es la capital de Francia?", proveedor)
        final = eventos[-1][1]["mensaje"]
        self.assertTrue(final["sin_respuesta"])
        self.assertEqual(final["citas"], [])
        self.assertEqual(final["contenido"], FRASE_NO_ENCONTRE)

    def test_coleccion_sin_documentos_listos_no_llama_al_modelo(self):
        vacia = Coleccion.objects.create(propietario=self.ana, nombre="Vacía")
        self.crear_documento(vacia, "Procesando.pdf", estado=Documento.Estado.PROCESANDO)
        proveedor = ProveedorChatFalso(["no debería usarse"])
        _, eventos = self.preguntar("¿Algo?", proveedor, coleccion=vacia)
        self.assertEqual(proveedor.llamadas, [])
        self.assertEqual(eventos[-1][1]["mensaje"]["contenido"], MENSAJE_SIN_DOCUMENTOS)
        self.assertTrue(eventos[-1][1]["mensaje"]["sin_respuesta"])

    def test_nunca_usa_fragmentos_de_otra_coleccion(self):
        # La respuesta existe... pero en OTRA colección (y otro usuario)
        otra = Coleccion.objects.create(propietario=self.beto, nombre="Recetas")
        receta = self.crear_documento(otra, "Recetas.pdf")
        self.crear_fragmento(receta, 1, "El pastel se hornea 40 minutos.", eje=2)
        propia = Coleccion.objects.create(propietario=self.ana, nombre="Recetas mías")
        self.crear_fragmento(self.crear_documento(propia, "Mis recetas.pdf"), 1, "Agua hirviendo.", eje=3)

        proveedor = ProveedorChatFalso([FRASE_NO_ENCONTRE])
        _, eventos = self.preguntar("¿Cuánto se hornea el pastel?", proveedor, eje_pregunta=2)
        documentos = {fuente["documento"] for fuente in eventos[1][1]}
        self.assertEqual(documentos, {"Contrato.pdf"})
        self.assertNotIn("40 minutos", proveedor.llamadas[0]["contenido"])
        self.assertNotIn("Agua hirviendo", proveedor.llamadas[0]["contenido"])

    def test_ignora_documentos_que_no_estan_listos(self):
        con_error = self.crear_documento(self.coleccion, "Roto.pdf", estado=Documento.Estado.ERROR)
        self.crear_fragmento(con_error, 1, "Texto de un documento con error.", eje=0)
        proveedor = ProveedorChatFalso(["30 días [1]."])
        _, eventos = self.preguntar("¿Aviso?", proveedor)
        self.assertNotIn("Roto.pdf", {fuente["documento"] for fuente in eventos[1][1]})

    def test_trae_como_maximo_8_fragmentos(self):
        for i in range(12):
            self.crear_fragmento(self.contrato, 20 + i, f"Cláusula {i}.", eje=4)
        _, eventos = self.preguntar("¿Cláusulas?", ProveedorChatFalso(["Ok [1]."]), eje_pregunta=4)
        self.assertEqual(len(eventos[1][1]), 8)

    # --- errores ---
    def test_limite_de_gemini_llega_como_evento_de_error(self):
        proveedor = ProveedorChatFalso(error=ErrorChat(MENSAJE_LIMITE))
        _, eventos = self.preguntar("¿Aviso?", proveedor)
        self.assertEqual(eventos[-1], ("error", {"mensaje": MENSAJE_LIMITE}))
        self.assertFalse(Mensaje.objects.filter(rol="asistente").exists())

    def test_limite_al_buscar_tambien_da_error_claro(self):
        with patch("chat.busqueda.generar_embeddings", side_effect=ErrorTemporal("429")):
            respuesta = self.client.post(reverse("preguntar", args=[self.coleccion.pk]), {"pregunta": "¿Aviso?"}, format="json")
            eventos = leer_eventos(respuesta)
        self.assertEqual(eventos[-1], ("error", {"mensaje": MENSAJE_LIMITE}))

    def test_falla_a_media_respuesta_guarda_lo_que_hubo(self):
        proveedor = ProveedorChatFalso(["El aviso ", "es de 30 [1]", " días"], error=ErrorChat("Se cortó."), error_despues_de=2)
        _, eventos = self.preguntar("¿Aviso?", proveedor)
        self.assertEqual(eventos[-1][0], "error")
        guardado = Mensaje.objects.get(rol="asistente")
        self.assertTrue(guardado.interrumpida)
        self.assertEqual(guardado.contenido, "El aviso es de 30 [1]")

    def test_detener_a_media_respuesta_guarda_lo_que_hubo(self):
        # Probamos directo el generador: cuando el navegador corta la conexión,
        # el servidor llama close() y Python lanza GeneratorExit dentro de él.
        conversacion = Conversacion.objects.create(coleccion=self.coleccion, titulo="Prueba")
        pregunta = Mensaje.objects.create(conversacion=conversacion, rol="usuario", contenido="¿Aviso?")
        proveedor = ProveedorChatFalso(["El aviso ", "es de 30 [1]", " días."])
        with patch("chat.busqueda.generar_embeddings", return_value=[vector(0)]), patch(
            "chat.respuesta.obtener_proveedor_chat", return_value=proveedor
        ):
            eventos = responder(conversacion, "¿Aviso?", [], pregunta)
            for _ in range(4):  # inicio, fuentes y dos trozos de texto
                next(eventos)
            eventos.close()
        guardado = Mensaje.objects.get(rol="asistente")
        self.assertTrue(guardado.interrumpida)
        self.assertEqual(guardado.contenido, "El aviso es de 30 [1]")
        self.assertEqual(guardado.citas[0]["pagina"], 4)

    def test_detener_sin_texto_no_guarda_nada(self):
        conversacion = Conversacion.objects.create(coleccion=self.coleccion, titulo="Prueba")
        pregunta = Mensaje.objects.create(conversacion=conversacion, rol="usuario", contenido="¿Aviso?")
        with patch("chat.busqueda.generar_embeddings", return_value=[vector(0)]):
            eventos = responder(conversacion, "¿Aviso?", [], pregunta)
            next(eventos)
            eventos.close()
        self.assertFalse(Mensaje.objects.filter(rol="asistente").exists())

    # --- validación y seguridad ---
    def test_pregunta_vacia_o_muy_larga(self):
        for pregunta in ["   ", "x" * 2001]:
            respuesta, _ = self.preguntar(pregunta, ProveedorChatFalso())
            self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_se_puede_preguntar_en_coleccion_ajena(self):
        self.como(self.beto)
        respuesta, _ = self.preguntar("¿Aviso?", ProveedorChatFalso())
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_se_puede_continuar_conversacion_ajena_ni_leerla(self):
        _, eventos = self.preguntar("¿Aviso?", ProveedorChatFalso(["30 [1]."]))
        id_conversacion = eventos[0][1]["conversacion"]["id"]
        self.como(self.beto)
        propia = Coleccion.objects.create(propietario=self.beto, nombre="Mía")
        respuesta, _ = self.preguntar("¿Aviso?", ProveedorChatFalso(), coleccion=propia, conversacion=id_conversacion)
        self.assertEqual(respuesta.status_code, status.HTTP_404_NOT_FOUND)
        detalle = self.client.get(reverse("conversacion-detail", args=[id_conversacion]))
        self.assertEqual(detalle.status_code, status.HTTP_404_NOT_FOUND)

    def test_leer_conversacion_propia(self):
        _, eventos = self.preguntar("¿Aviso?", ProveedorChatFalso(["30 días [1]."]))
        id_conversacion = eventos[0][1]["conversacion"]["id"]
        datos = self.client.get(reverse("conversacion-detail", args=[id_conversacion])).data
        self.assertEqual([m["rol"] for m in datos["mensajes"]], ["usuario", "asistente"])
        self.assertEqual(datos["mensajes"][1]["citas"][0]["pagina"], 4)

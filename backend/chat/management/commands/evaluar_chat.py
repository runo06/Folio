"""
Evaluación del chat con Gemini REAL.

    docker compose exec backend python manage.py evaluar_chat

Las pruebas automáticas usan un modelo falso: comprueban NUESTRO código,
pero no si el modelo obedece el prompt. Este comando sí le pregunta a
Gemini, con un documento inventado (para que no pueda saber las
respuestas de antemano), y revisa:
  - preguntas con respuesta: que la encuentre y cite la página correcta
  - preguntas sin respuesta: que diga que no la encontró

Gasta cuota del plan gratuito y el modelo no responde siempre idéntico,
por eso no forma parte de "manage.py test".
"""
import re
import time
import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from fpdf import FPDF

from biblioteca.models import Coleccion, Documento
from chat.models import Conversacion, Mensaje
from chat.respuesta import responder
from procesamiento.tasks import procesar

PAGINAS = [
    "Manual interno de la Cooperativa Huerta Alta.\n\n"
    "La cooperativa fue fundada en el año 2011 en el municipio de San Bartolo por catorce familias "
    "productoras de amaranto. Su asamblea general se reúne el primer sábado de cada trimestre en la "
    "bodega comunitaria. Las decisiones se toman por mayoría simple de los socios presentes.",
    "Política de préstamo de herramientas.\n\n"
    "Cada socio puede pedir prestadas hasta tres herramientas a la vez, por un máximo de diez días. "
    "Los retrasos en la devolución se penalizan con 25 pesos por cada día. Las herramientas dañadas "
    "deben reportarse al comité de bodega antes de 48 horas.",
    "Calendario de producción.\n\n"
    "El amaranto se siembra en el mes de junio y se cosecha entre noviembre y diciembre. La cooperativa "
    "vende la mayor parte de su producción a dos panaderías de la ciudad de Puebla y el resto en el "
    "tianguis dominical de San Bartolo.",
]

# (pregunta, ¿tiene respuesta?, patrón esperado en la respuesta, página que debe citar)
PREGUNTAS = [
    ("¿En qué año se fundó la cooperativa?", True, r"2011", 1),
    ("¿Cada cuánto se reúne la asamblea general?", True, r"trimestre", 1),
    ("¿Cuántas herramientas puede pedir prestadas un socio a la vez?", True, r"tres|\b3\b", 2),
    ("¿Cuánto se cobra por cada día de retraso al devolver una herramienta?", True, r"25", 2),
    ("¿En qué meses se cosecha el amaranto?", True, r"noviembre", 3),
    ("¿Cuál es la capital de Francia?", False, None, None),
    ("¿Quién es el presidente actual de la cooperativa?", False, None, None),
    ("¿Cuál es el número de teléfono de la cooperativa?", False, None, None),
    ("¿Qué fertilizante usan en sus cultivos?", False, None, None),
    ("¿A qué precio venden el kilo de amaranto?", False, None, None),
]


def crear_pdf():
    pdf = FPDF()
    pdf.set_font("Helvetica", size=12)
    for texto in PAGINAS:
        pdf.add_page()
        pdf.multi_cell(0, 7, texto)
    return bytes(pdf.output())


class Command(BaseCommand):
    help = "Evalúa el chat con Gemini real usando un documento de prueba."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pausa", type=float, default=7,
            help="Segundos entre preguntas, para respetar el límite por minuto (por defecto 7).",
        )

    def handle(self, *args, **opciones):
        if not settings.GEMINI_API_KEY:
            raise CommandError("Falta GEMINI_API_KEY en el .env")

        Usuario = get_user_model()
        usuario = Usuario.objects.create_user(f"evaluacion-{uuid.uuid4().hex[:8]}@folio.local", uuid.uuid4().hex)
        try:
            self.evaluar(usuario, opciones["pausa"])
        finally:
            usuario.delete()  # borra en cascada la colección, el PDF y las conversaciones

    def evaluar(self, usuario, pausa):
        coleccion = Coleccion.objects.create(propietario=usuario, nombre="Evaluación")
        contenido = crear_pdf()
        documento = Documento.objects.create(
            coleccion=coleccion,
            archivo=ContentFile(contenido, name="manual.pdf"),
            nombre_original="Manual Huerta Alta.pdf",
            tamano_bytes=len(contenido),
            num_paginas=len(PAGINAS),
        )
        self.stdout.write("Procesando el documento de prueba con Gemini…")
        procesar(documento)
        documento.refresh_from_db()
        if documento.estado != Documento.Estado.LISTO:
            raise CommandError(f"No se pudo procesar el documento: {documento.mensaje_error}")

        self.stdout.write(f"Modelo de chat: {settings.FOLIO_CHAT_MODELO}\n")
        aciertos = 0
        for indice, (pregunta, tiene_respuesta, patron, pagina) in enumerate(PREGUNTAS):
            if indice:
                time.sleep(pausa)
            final, error = self.preguntar(coleccion, pregunta)
            correcto, detalle = self.calificar(final, error, tiene_respuesta, patron, pagina)
            aciertos += correcto
            marca = self.style.SUCCESS("BIEN") if correcto else self.style.ERROR("MAL ")
            tipo = "con respuesta" if tiene_respuesta else "sin respuesta"
            self.stdout.write(f"{marca}  [{tipo}] {pregunta}")
            self.stdout.write(f"      {detalle}")

        total = len(PREGUNTAS)
        estilo = self.style.SUCCESS if aciertos == total else self.style.WARNING
        self.stdout.write(estilo(f"\nResultado: {aciertos} de {total} correctas"))

    def preguntar(self, coleccion, pregunta):
        conversacion = Conversacion.objects.create(coleccion=coleccion, titulo=pregunta[:80])
        mensaje = Mensaje.objects.create(conversacion=conversacion, rol=Mensaje.Rol.USUARIO, contenido=pregunta)
        final = error = None
        for tipo, datos in responder(conversacion, pregunta, [], mensaje):
            if tipo == "fin":
                final = datos["mensaje"]
            elif tipo == "error":
                error = datos["mensaje"]
        return final, error

    def calificar(self, final, error, tiene_respuesta, patron, pagina):
        if error:
            return False, f"Error: {error}"
        texto = final["contenido"].replace("\n", " ")
        resumen = texto if len(texto) <= 110 else texto[:107] + "…"
        if not tiene_respuesta:
            return final["sin_respuesta"], resumen
        if final["sin_respuesta"]:
            return False, "Dijo que no lo encontró, pero sí está en el documento."
        paginas = sorted({cita["pagina"] for cita in final["citas"]})
        if not re.search(patron, texto, re.IGNORECASE):
            return False, f"No incluye lo esperado ({patron}): {resumen}"
        if pagina not in paginas:
            return False, f"Citó las págs. {paginas or 'ninguna'}, se esperaba la {pagina}: {resumen}"
        return True, f"{resumen}  (págs. citadas: {paginas})"

"""
Extracción del texto de un PDF, página por página.

pypdf lee el texto que el PDF trae "dentro". Un PDF escaneado no trae
texto (son fotos de páginas), así que sus páginas salen vacías: eso lo
detectamos con tiene_texto().
"""
import logging
import re

from pypdf import PdfReader

logger = logging.getLogger(__name__)

# Una palabra cortada al final de una línea: "conoci-\nmiento" -> "conocimiento"
GUION_FIN_DE_LINEA = re.compile(r"(\w)-\n(\w)")
ESPACIOS = re.compile(r"[ \t\f\v ]+")
LINEAS_VACIAS = re.compile(r"\n\s*\n\s*(\n\s*)+")
ALFANUMERICO = re.compile(r"\w")


def limpiar_texto(texto):
    texto = texto.replace("\x00", "")  # PostgreSQL no acepta el carácter nulo
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    texto = GUION_FIN_DE_LINEA.sub(r"\1\2", texto)
    texto = ESPACIOS.sub(" ", texto)
    texto = "\n".join(linea.strip() for linea in texto.split("\n"))
    texto = LINEAS_VACIAS.sub("\n\n", texto)  # como máximo una línea en blanco seguida
    return texto.strip()


def tiene_texto(texto, minimo=3):
    """Una página "tiene texto" si trae al menos unas cuantas letras o números."""
    return len(ALFANUMERICO.findall(texto)) >= minimo


def extraer_paginas(archivo):
    """Devuelve [(numero_de_pagina, texto_limpio), ...] empezando en la página 1."""
    lector = PdfReader(archivo)
    if lector.is_encrypted:
        lector.decrypt("")  # los aceptados al subir se abren sin contraseña

    paginas = []
    for numero, pagina in enumerate(lector.pages, start=1):
        try:
            texto = pagina.extract_text() or ""
        except Exception:
            # Una página rota no debe tumbar el documento entero
            logger.warning("No se pudo leer la página %s", numero, exc_info=True)
            texto = ""
        paginas.append((numero, limpiar_texto(texto)))
    return paginas

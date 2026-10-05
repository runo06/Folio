"""
Validación de PDFs subidos.

No basta con mirar la extensión: cualquiera puede renombrar "virus.exe" a
"tesis.pdf". Por eso:
  1. Revisamos la "firma" del archivo: todo PDF empieza con %PDF-.
  2. Lo abrimos con pypdf. Si no se puede leer, está dañado o no es PDF.
  3. Si pide contraseña para abrirse, lo rechazamos (no podríamos leer
     su texto en la fase 2).
"""
from django.conf import settings
from pypdf import PasswordType, PdfReader
from pypdf.errors import PyPdfError
from rest_framework.exceptions import ValidationError

FIRMA_PDF = b"%PDF-"


def formato_mb(tamano_bytes):
    return f"{tamano_bytes / (1024 * 1024):.0f} MB"


def analizar_pdf(archivo):
    """Valida el archivo subido y devuelve su número de páginas."""
    maximo = settings.FOLIO_TAMANO_MAXIMO_PDF
    if archivo.size > maximo:
        raise ValidationError(f"El archivo pesa más de {formato_mb(maximo)}.")

    if not archivo.name.lower().endswith(".pdf"):
        raise ValidationError("Solo se aceptan archivos PDF.")

    # La especificación permite algo de basura antes de la firma,
    # siempre que aparezca dentro de los primeros 1024 bytes.
    archivo.seek(0)
    if FIRMA_PDF not in archivo.read(1024):
        raise ValidationError("El archivo no es un PDF válido.")
    archivo.seek(0)

    try:
        lector = PdfReader(archivo)
        if lector.is_encrypted:
            # Algunos PDF están "cifrados" solo para impedir imprimir o copiar,
            # pero se abren sin contraseña. Esos sí los aceptamos.
            if lector.decrypt("") == PasswordType.NOT_DECRYPTED:
                raise ValidationError("El PDF está protegido con contraseña.")
        num_paginas = len(lector.pages)
    except ValidationError:
        raise
    except (PyPdfError, ValueError, KeyError, TypeError, NotImplementedError):
        raise ValidationError("El PDF está dañado o no se puede leer.")
    finally:
        archivo.seek(0)

    if num_paginas == 0:
        raise ValidationError("El PDF no tiene páginas.")
    return num_paginas

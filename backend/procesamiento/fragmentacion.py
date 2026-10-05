"""
División del texto en fragmentos ("chunking").

Estrategia recursiva:
  1. Intentamos cortar por párrafos (línea en blanco).
  2. Si un párrafo sigue siendo demasiado largo, por líneas.
  3. Si no, por oraciones; luego por palabras; y como último recurso,
     por caracteres.
Después juntamos las piezas pequeñas hasta acercarnos al tamaño deseado,
repitiendo un poco del final de cada fragmento al inicio del siguiente
(el "solapamiento") para que una idea cortada no se pierda.

Cada página se fragmenta por separado: así cada fragmento tiene
exactamente una página y las citas de la fase 3 serán exactas.
"""
from dataclasses import dataclass

SEPARADORES = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]


@dataclass(frozen=True)
class FragmentoTexto:
    pagina: int
    orden: int
    texto: str


def _dividir(texto, separadores, tamano):
    """Parte el texto en piezas de como máximo `tamano` caracteres."""
    if len(texto) <= tamano:
        return [texto]

    separador, *siguientes = separadores
    if separador == "":
        return [texto[i : i + tamano] for i in range(0, len(texto), tamano)]

    partes = texto.split(separador)
    if len(partes) == 1:
        return _dividir(texto, siguientes, tamano)

    piezas = []
    for indice, parte in enumerate(partes):
        # Conservamos el separador pegado a su parte (". " queda al final de la oración)
        trozo = parte + (separador if indice < len(partes) - 1 else "")
        if not trozo:
            continue
        if len(trozo) <= tamano:
            piezas.append(trozo)
        else:
            piezas.extend(_dividir(trozo, siguientes, tamano))
    return piezas


def _unir(piezas, tamano, solape):
    """Junta piezas en fragmentos de hasta `tamano`, con `solape` de traslape."""
    fragmentos = []
    actual = []
    largo = 0

    for pieza in piezas:
        if actual and largo + len(pieza) > tamano:
            fragmentos.append("".join(actual))
            # Soltamos piezas del inicio hasta que lo que queda quepa en el
            # solapamiento y además deje sitio para la pieza nueva.
            while actual and (largo > solape or largo + len(pieza) > tamano):
                largo -= len(actual.pop(0))
        actual.append(pieza)
        largo += len(pieza)

    if actual:
        fragmentos.append("".join(actual))
    return [fragmento.strip() for fragmento in fragmentos if fragmento.strip()]


def fragmentar_texto(texto, tamano=1200, solape=200):
    if solape >= tamano:
        raise ValueError("El solapamiento debe ser menor que el tamaño del fragmento")
    return _unir(_dividir(texto, SEPARADORES, tamano), tamano, solape)


def fragmentar_paginas(paginas, tamano=1200, solape=200):
    """Recibe [(pagina, texto), ...] y devuelve FragmentoTexto numerados en orden."""
    fragmentos = []
    for pagina, texto in paginas:
        for trozo in fragmentar_texto(texto, tamano, solape):
            fragmentos.append(FragmentoTexto(pagina=pagina, orden=len(fragmentos), texto=trozo))
    return fragmentos

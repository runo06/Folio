/*
  Abre un PDF en una pestaña nueva, opcionalmente en una página concreta.

  - El PDF se descarga con el token (un enlace normal no podría enviarlo)
    y se abre como URL temporal "blob:".
  - "#page=12" al final de la URL lo entiende el visor de PDF del
    navegador y salta a esa página.
  - Guardamos las URLs ya descargadas para no bajar el mismo PDF en cada
    clic a una cita.
*/
import { documentos } from "../api/folio";

const descargados = new Map(); // id del documento -> URL blob

export async function abrirPdf(idDocumento, pagina) {
  // La pestaña se abre YA, durante el clic; si se abriera después de la
  // descarga, el navegador la bloquearía como ventana emergente.
  const pestana = window.open("", "_blank");
  if (pestana) pestana.document.title = "Abriendo PDF…";

  try {
    let url = descargados.get(idDocumento);
    if (!url) {
      url = URL.createObjectURL(await documentos.descargar(idDocumento));
      descargados.set(idDocumento, url);
    }
    const destino = pagina ? `${url}#page=${pagina}` : url;
    if (pestana) pestana.location.href = destino;
    else window.location.href = destino;
  } catch (error) {
    pestana?.close();
    throw error;
  }
}

// Si se borra un documento, liberamos su copia en memoria
export function olvidarPdf(idDocumento) {
  const url = descargados.get(idDocumento);
  if (url) URL.revokeObjectURL(url);
  descargados.delete(idDocumento);
}

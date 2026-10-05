/*
  Acceso a los PDF desde el navegador.

  - El PDF se descarga con el token (un enlace normal no podría enviarlo).
  - Guardamos cada PDF descargado en memoria (como Blob) para no bajarlo
    otra vez en cada clic a una cita: lo comparten el visor y las pestañas.
*/
import { documentos } from "../api/folio";

const descargados = new Map(); // id del documento -> Promise<Blob>
const urls = new Map(); // id del documento -> URL "blob:" para abrir en pestaña

// Si dos componentes lo piden a la vez, comparten la misma descarga
export function obtenerPdf(idDocumento) {
  if (!descargados.has(idDocumento)) {
    const descarga = documentos.descargar(idDocumento).catch((error) => {
      descargados.delete(idDocumento); // que un fallo no quede guardado
      throw error;
    });
    descargados.set(idDocumento, descarga);
  }
  return descargados.get(idDocumento);
}

/*
  Abre el PDF en una pestaña nueva. "#page=12" al final de la URL lo
  entiende el visor de PDF del navegador y salta a esa página.
*/
export async function abrirPdf(idDocumento, pagina) {
  // La pestaña se abre YA, durante el clic; si se abriera después de la
  // descarga, el navegador la bloquearía como ventana emergente.
  const pestana = window.open("", "_blank");
  if (pestana) pestana.document.title = "Abriendo PDF…";
  try {
    if (!urls.has(idDocumento)) urls.set(idDocumento, URL.createObjectURL(await obtenerPdf(idDocumento)));
    const destino = pagina ? `${urls.get(idDocumento)}#page=${pagina}` : urls.get(idDocumento);
    if (pestana) pestana.location.href = destino;
    else window.location.href = destino;
  } catch (error) {
    pestana?.close();
    throw error;
  }
}

// Si se borra un documento, liberamos su copia en memoria
export function olvidarPdf(idDocumento) {
  if (urls.has(idDocumento)) URL.revokeObjectURL(urls.get(idDocumento));
  urls.delete(idDocumento);
  descargados.delete(idDocumento);
}

export function formatoTamano(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const formatoFecha = new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" });

export function formatoFechaCorta(textoIso) {
  return formatoFecha.format(new Date(textoIso)).replace(".", "");
}

export function plural(cantidad, singular, pluralTexto = `${singular}s`) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

/*
  Convierte un error de axios en mensajes legibles.
  DRF responde errores con estas formas:
    { "detail": "..." }                     -> error general
    { "nombre": ["..."], "email": ["..."] } -> errores por campo
    { "non_field_errors": ["..."] }         -> error del formulario
*/
export function leerErrores(error) {
  const datos = error?.response?.data;

  if (!error?.response) {
    return { general: "No hay conexión con el servidor. Revisa que Folio esté corriendo.", campos: {} };
  }
  if (!datos || typeof datos !== "object" || datos instanceof Blob) {
    return { general: "Ocurrió un error inesperado. Inténtalo de nuevo.", campos: {} };
  }

  const campos = {};
  let general = typeof datos.detail === "string" ? datos.detail : null;

  for (const [campo, mensajes] of Object.entries(datos)) {
    if (campo === "detail") continue;
    const texto = Array.isArray(mensajes) ? mensajes.join(" ") : String(mensajes);
    if (campo === "non_field_errors") general = texto;
    else campos[campo] = texto;
  }

  return { general, campos };
}

// Un solo mensaje, para avisos breves
export function mensajeDeError(error) {
  const { general, campos } = leerErrores(error);
  return general ?? Object.values(campos)[0] ?? "Ocurrió un error inesperado.";
}

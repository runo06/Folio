/*
  Encuentra un fragmento de texto dentro de la capa de texto de PDF.js.

  PDF.js parte el texto de la página en muchos <span> (uno por "trozo"
  que el PDF dibuja), y el texto de nuestro fragmento fue limpiado al
  procesarlo (guiones unidos, espacios juntos...). Por eso comparamos una
  versión "normalizada" de ambos: sin acentos, sin espacios y sin
  puntuación. Es aproximado a propósito: si no lo encuentra, no pasa nada,
  el visor ya está en la página correcta.
*/
function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Devuelve los índices de los span que contienen el fragmento
export function buscarFragmento(textosDeSpans, fragmento) {
  const objetivo = normalizar(fragmento);
  if (objetivo.length < 12) return [];

  // Unimos todos los span y recordamos dónde empieza y termina cada uno
  let todo = "";
  const rangos = textosDeSpans.map((texto) => {
    const inicio = todo.length;
    todo += normalizar(texto);
    return [inicio, todo.length];
  });

  // Probamos con el inicio del fragmento; si no aparece, con trozos más cortos
  let posicion = -1;
  for (const largo of [80, 40, 20]) {
    posicion = todo.indexOf(objetivo.slice(0, largo));
    if (posicion !== -1) break;
  }
  if (posicion === -1) return [];

  const fin = Math.min(todo.length, posicion + objetivo.length);
  return rangos.flatMap(([inicio, final], indice) => (final > posicion && inicio < fin ? [indice] : []));
}

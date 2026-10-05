/*
  API del chat.

  La respuesta llega en streaming con Server-Sent Events (SSE). El navegador
  tiene EventSource para eso, pero solo hace peticiones GET y no permite
  mandar la cabecera Authorization. Por eso usamos fetch y leemos el cuerpo
  de la respuesta trozo a trozo con un "lector" (ReadableStream).
*/
import cliente, { obtenerTokenAcceso, renovarSesion } from "./cliente";

export const conversaciones = {
  obtener: (id) => cliente.get(`/conversaciones/${id}/`).then((r) => r.data),
};

// Un evento SSE es un bloque de líneas "event: x" y "data: {...}"
function leerEvento(bloque) {
  let tipo = "message";
  let datos = "";
  for (const linea of bloque.split("\n")) {
    if (linea.startsWith("event: ")) tipo = linea.slice(7);
    else if (linea.startsWith("data: ")) datos += linea.slice(6);
  }
  return datos ? { tipo, datos: JSON.parse(datos) } : null;
}

/*
  Envía una pregunta y llama a alEvento(tipo, datos) por cada evento que
  llega: inicio, fuentes, texto (muchas veces), fin o error.
  `senal` viene de un AbortController: abortarla corta la respuesta.
*/
export async function preguntar({ idColeccion, pregunta, conversacion, senal, alEvento }) {
  const enviar = () =>
    fetch(`/api/colecciones/${idColeccion}/preguntar/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${obtenerTokenAcceso()}`,
      },
      body: JSON.stringify({ pregunta, conversacion }),
      signal: senal,
    });

  let respuesta = await enviar();
  if (respuesta.status === 401) {
    // Token vencido: lo renovamos y repetimos, igual que hace axios
    await renovarSesion();
    respuesta = await enviar();
  }

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}));
    // Mismo formato que un error de axios, para reutilizar leerErrores()
    throw { response: { status: respuesta.status, data: datos } };
  }

  // TextDecoderStream convierte bytes en texto (UTF-8) conforme llegan
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = "";
  while (true) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    // Un trozo puede traer medio evento o varios: procesamos los completos
    let corte;
    while ((corte = pendiente.indexOf("\n\n")) !== -1) {
      const evento = leerEvento(pendiente.slice(0, corte));
      pendiente = pendiente.slice(corte + 2);
      if (evento) alEvento(evento.tipo, evento.datos);
    }
  }
}

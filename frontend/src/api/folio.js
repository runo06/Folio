/*
  Todas las llamadas a la API en un solo lugar. Los componentes nunca
  escriben URLs: llaman a estas funciones. Si mañana cambia una ruta,
  solo se toca este archivo.
*/
import cliente from "./cliente";

// ---------- Cuentas ----------
export const auth = {
  entrar: (email, password) => cliente.post("/auth/token/", { email, password }).then((r) => r.data),
  registrar: (datos) => cliente.post("/auth/registro/", datos).then((r) => r.data),
  salir: () => cliente.post("/auth/salir/"),
  yo: () => cliente.get("/auth/yo/").then((r) => r.data),
};

// ---------- Colecciones ----------
export const colecciones = {
  listar: () => cliente.get("/colecciones/").then((r) => r.data),
  obtener: (id) => cliente.get(`/colecciones/${id}/`).then((r) => r.data),
  crear: (datos) => cliente.post("/colecciones/", datos).then((r) => r.data),
  actualizar: (id, datos) => cliente.patch(`/colecciones/${id}/`, datos).then((r) => r.data),
  borrar: (id) => cliente.delete(`/colecciones/${id}/`),
};

// ---------- Documentos ----------
export const documentos = {
  listar: (idColeccion) => cliente.get(`/colecciones/${idColeccion}/documentos/`).then((r) => r.data),

  // alAvanzar recibe un número de 0 a 100 mientras el archivo se envía
  subir: (idColeccion, archivo, alAvanzar) => {
    const formulario = new FormData();
    formulario.append("archivo", archivo);
    return cliente
      .post(`/colecciones/${idColeccion}/documentos/`, formulario, {
        onUploadProgress: (evento) => {
          if (evento.total) alAvanzar(Math.round((evento.loaded / evento.total) * 100));
        },
      })
      .then((r) => r.data);
  },

  borrar: (id) => cliente.delete(`/documentos/${id}/`),

  // El PDF se descarga como "blob" (datos binarios) con el token en la
  // cabecera. Un enlace normal <a href> no podría mandar ese token.
  descargar: (id) =>
    cliente
      .get(`/documentos/${id}/archivo/`, { responseType: "blob" })
      .then((r) => new Blob([r.data], { type: "application/pdf" })),
};

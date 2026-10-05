/*
  Cliente HTTP de Folio, construido con axios.

  Cómo funciona la sesión:
  - El token de ACCESO vive solo en la variable `tokenAcceso` (en memoria).
    Si recargas la página se pierde, y eso está bien: lo recuperamos con
    el token de REFRESCO, que el navegador guarda en una cookie httpOnly y
    envía solo a /api/auth/.
  - Cada petición lleva el token de acceso en la cabecera Authorization.
  - Si el backend responde 401 (token vencido), pedimos uno nuevo y
    repetimos la petición original sin que el usuario se entere.
*/
import axios from "axios";

const cliente = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

let tokenAcceso = null;
let alExpirarSesion = () => {};

export function guardarTokenAcceso(token) {
  tokenAcceso = token;
}

// El contexto de autenticación registra aquí qué hacer si la sesión muere
export function registrarAlExpirarSesion(funcion) {
  alExpirarSesion = funcion;
}

// Renovación "de un solo vuelo": si varias peticiones fallan a la vez,
// todas esperan la MISMA renovación. Si cada una pidiera la suya, la
// rotación de tokens invalidaría las demás y se cerraría la sesión.
let renovacionEnCurso = null;

export function renovarSesion() {
  if (!renovacionEnCurso) {
    renovacionEnCurso = cliente
      .post("/auth/token/refrescar/")
      .then((respuesta) => {
        guardarTokenAcceso(respuesta.data.acceso);
        return respuesta.data.acceso;
      })
      .finally(() => {
        renovacionEnCurso = null;
      });
  }
  return renovacionEnCurso;
}

// Interceptor de salida: agrega el token a cada petición
cliente.interceptors.request.use((config) => {
  if (tokenAcceso) {
    config.headers.Authorization = `Bearer ${tokenAcceso}`;
  }
  return config;
});

// Interceptor de llegada: si el token venció, renueva y reintenta una vez
cliente.interceptors.response.use(
  (respuesta) => respuesta,
  async (error) => {
    const original = error.config;
    const esDeAutenticacion = original?.url?.startsWith("/auth/");

    if (error.response?.status === 401 && original && !original._reintentada && !esDeAutenticacion) {
      original._reintentada = true;
      try {
        await renovarSesion();
        return cliente(original);
      } catch {
        guardarTokenAcceso(null);
        alExpirarSesion();
      }
    }
    return Promise.reject(error);
  },
);

export default cliente;

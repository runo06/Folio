/*
  Contexto de autenticación.

  Un "contexto" de React es una forma de compartir datos con TODOS los
  componentes sin pasarlos como props de padre a hijo a nieto. Aquí
  compartimos: quién es el usuario, si todavía estamos comprobando la
  sesión, y las funciones entrar / registrar / salir.

  Cualquier componente lo usa así:
    const { usuario, salir } = useAutenticacion();
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { guardarTokenAcceso, registrarAlExpirarSesion, renovarSesion } from "../api/cliente";
import { auth } from "../api/folio";

const AutenticacionContexto = createContext(null);

export function ProveedorAutenticacion({ children }) {
  const [usuario, setUsuario] = useState(null);
  // true mientras averiguamos si había una sesión abierta (al recargar)
  const [comprobando, setComprobando] = useState(true);

  // useEffect con [] se ejecuta una vez, cuando la app aparece en pantalla.
  // Intentamos recuperar la sesión con la cookie de refresco.
  useEffect(() => {
    let vigente = true;
    renovarSesion()
      .then(() => auth.yo())
      .then((datos) => vigente && setUsuario(datos))
      .catch(() => vigente && setUsuario(null))
      .finally(() => vigente && setComprobando(false));

    // Si una petición descubre que la sesión murió, volvemos a "sin usuario"
    registrarAlExpirarSesion(() => setUsuario(null));

    // Limpieza: si el componente desaparece antes de terminar, no
    // actualizamos un estado que ya no existe.
    return () => {
      vigente = false;
    };
  }, []);

  // useCallback guarda la misma función entre renderizados; así los
  // componentes que la reciben no se vuelven a dibujar sin necesidad.
  const iniciarSesion = useCallback((datos) => {
    guardarTokenAcceso(datos.acceso);
    setUsuario(datos.usuario);
  }, []);

  const entrar = useCallback(
    async (email, password) => iniciarSesion(await auth.entrar(email, password)),
    [iniciarSesion],
  );

  const registrar = useCallback(
    async (datos) => iniciarSesion(await auth.registrar(datos)),
    [iniciarSesion],
  );

  const salir = useCallback(async () => {
    try {
      await auth.salir();
    } finally {
      guardarTokenAcceso(null);
      setUsuario(null);
    }
  }, []);

  const valor = useMemo(
    () => ({ usuario, comprobando, entrar, registrar, salir }),
    [usuario, comprobando, entrar, registrar, salir],
  );

  return <AutenticacionContexto.Provider value={valor}>{children}</AutenticacionContexto.Provider>;
}

// Un "hook" propio: una función que empieza con "use" y usa otros hooks
export function useAutenticacion() {
  const contexto = useContext(AutenticacionContexto);
  if (!contexto) throw new Error("useAutenticacion debe usarse dentro de <ProveedorAutenticacion>");
  return contexto;
}

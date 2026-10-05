/*
  Marco de las pantallas privadas: cabecera arriba y la página debajo.
  También hace de "guardia": si no hay sesión, manda a /entrar.
*/
import { Navigate, NavLink, Outlet, useLocation, useMatch } from "react-router";
import { useAutenticacion } from "../contexto/AutenticacionContexto";
import Marca from "./Marca";
import estilos from "./DisenoApp.module.css";

function iniciales(usuario) {
  const base = usuario.nombre?.trim() || usuario.email;
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

export default function DisenoApp() {
  const { usuario, comprobando, salir } = useAutenticacion();
  const ubicacion = useLocation();
  // El chat es una pantalla "de aplicación": ocupa todo el alto, sin márgenes
  const pantallaCompleta = Boolean(useMatch("/colecciones/:id/chat"));

  if (comprobando) {
    return <div className={estilos.cargando} role="status">Abriendo Folio…</div>;
  }

  if (!usuario) {
    // Guardamos a dónde quería ir, para regresarlo ahí después de entrar
    return <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />;
  }

  return (
    <div className={pantallaCompleta ? estilos.aplicacion : undefined}>
      <header className={estilos.cabecera}>
        <div className={estilos.interior}>
          <Marca />
          <nav className={estilos.nav} aria-label="Principal">
            <NavLink to="/colecciones">Colecciones</NavLink>
          </nav>
          <div className={estilos.usuario}>
            <span className={estilos.nombre}>{usuario.nombre || usuario.email}</span>
            <span className={estilos.avatar} aria-hidden="true">
              {iniciales(usuario)}
            </span>
            <button className="boton boton-fantasma boton-chico" type="button" onClick={salir}>
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className={pantallaCompleta ? estilos.principalCompleto : estilos.principal}>
        {/* Outlet: aquí React Router dibuja la página que corresponde a la URL */}
        <Outlet />
      </main>
    </div>
  );
}

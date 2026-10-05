/*
  Diseño compartido por "Entrar" y "Crear cuenta": a la izquierda el panel
  que explica Folio y a la derecha el formulario (que llega como children).
  Si ya hay sesión, no tiene sentido mostrarlo: mandamos a las colecciones.
*/
import { Navigate, useLocation } from "react-router";
import Marca from "../componentes/Marca";
import { useAutenticacion } from "../contexto/AutenticacionContexto";
import estilos from "./Acceso.module.css";

export default function DisenoAcceso({ children }) {
  const { usuario, comprobando } = useAutenticacion();
  const ubicacion = useLocation();

  if (comprobando) return null;
  if (usuario) return <Navigate to={ubicacion.state?.desde ?? "/colecciones"} replace />;

  return (
    <div className={estilos.pantalla}>
      <aside className={estilos.lado}>
        <Marca destino="/entrar" />
        <p className={estilos.lema}>
          Tus documentos responden. <em>Con número de página.</em>
        </p>
        <div className={estilos.ejemplo}>
          <span className="etiqueta">Ejemplo</span>
          <p>«El arrendatario puede terminar el contrato avisando con 30 días de anticipación.»</p>
          <span className={estilos.cita}>
            Contrato de arrendamiento <span className="num">p. 4</span>
          </span>
        </div>
      </aside>
      <main className={estilos.formularioMarco}>{children}</main>
    </div>
  );
}

/*
  Avisos breves ("toasts") que aparecen abajo a la derecha y se van solos.
  Uso:  const avisar = useAvisos();  avisar("Colección creada");
        avisar("No se pudo borrar", "error");
*/
import { createContext, useCallback, useContext, useRef, useState } from "react";
import estilos from "./Avisos.module.css";

const AvisosContexto = createContext(null);
const DURACION_MS = 4500;

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  // useRef guarda un valor que sobrevive entre renderizados SIN provocar
  // que el componente se vuelva a dibujar cuando cambia.
  const siguienteId = useRef(1);

  const quitar = useCallback((id) => {
    setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id));
  }, []);

  const avisar = useCallback(
    (texto, tipo = "exito") => {
      const id = siguienteId.current++;
      // Forma "funcional" de setState: recibe el valor anterior. Es la
      // forma segura cuando el nuevo estado depende del anterior.
      setAvisos((actuales) => [...actuales.slice(-3), { id, texto, tipo }]);
      setTimeout(() => quitar(id), DURACION_MS);
    },
    [quitar],
  );

  return (
    <AvisosContexto.Provider value={avisar}>
      {children}
      {/* aria-live: los lectores de pantalla leen los avisos nuevos */}
      <div className={estilos.contenedor} aria-live="polite">
        {avisos.map((aviso) => (
          <div key={aviso.id} className={`${estilos.aviso} ${aviso.tipo === "error" ? estilos.error : ""}`}>
            <span className={estilos.punto} aria-hidden="true" />
            <span className={estilos.texto}>{aviso.texto}</span>
            <button className={estilos.cerrar} type="button" onClick={() => quitar(aviso.id)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        ))}
      </div>
    </AvisosContexto.Provider>
  );
}

export function useAvisos() {
  const contexto = useContext(AvisosContexto);
  if (!contexto) throw new Error("useAvisos debe usarse dentro de <ProveedorAvisos>");
  return contexto;
}

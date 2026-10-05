import { formatoTamano } from "../utilidades/formato";
import estilos from "./ColaSubidas.module.css";

/*
  Archivos que se están subiendo, que esperan turno o que fueron
  rechazados. Los que se suben bien desaparecen de aquí y pasan a la tabla.
*/
export default function ColaSubidas({ subidas, onQuitar }) {
  if (!subidas.length) return null;

  return (
    <ul className={estilos.lista} aria-label="Subidas en curso">
      {subidas.map((subida) => (
        <li key={subida.id} className={`${estilos.subida} ${subida.error ? estilos.rechazada : ""}`}>
          <span className={estilos.nombre}>{subida.nombre}</span>

          {subida.error ? (
            <>
              <button className="boton boton-fantasma boton-chico" type="button" onClick={() => onQuitar(subida.id)}>
                Quitar
              </button>
              <span className={estilos.motivo}>No se subió. {subida.error}</span>
            </>
          ) : (
            <>
              <span className={`${estilos.dato} num`}>
                {subida.progreso === null
                  ? "En espera"
                  : subida.progreso < 100
                    ? `${formatoTamano((subida.tamano * subida.progreso) / 100)} de ${formatoTamano(subida.tamano)} · ${subida.progreso} %`
                    : "Revisando el PDF…"}
              </span>
              <div
                className={estilos.barra}
                role="progressbar"
                aria-label={`Avance de ${subida.nombre}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={subida.progreso ?? 0}
              >
                <i style={{ width: `${subida.progreso ?? 0}%` }} />
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

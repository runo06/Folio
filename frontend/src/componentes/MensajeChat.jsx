import TextoRespuesta, { numerarCitas } from "./TextoRespuesta";
import estilos from "./MensajeChat.module.css";

function quitarExtension(nombre) {
  return nombre.replace(/\.pdf$/i, "");
}

export default function MensajeChat({ mensaje, onCitar }) {
  if (mensaje.rol === "usuario") {
    return (
      <div className={estilos.pregunta}>
        <p>{mensaje.contenido}</p>
      </div>
    );
  }

  // Mientras se escribe usamos todas las fuentes enviadas; al terminar, solo las citadas
  const fuentes = mensaje.enCurso ? (mensaje.fuentes ?? []) : (mensaje.citas ?? []);
  const { indicePorNumero, notas } = numerarCitas(mensaje.contenido, fuentes);
  const esperando = mensaje.enCurso && !mensaje.contenido;

  if (mensaje.sin_respuesta) {
    return (
      <div className={`${estilos.respuesta} ${estilos.sinRespuesta}`}>
        <span className="etiqueta">Sin respuesta en tus documentos</span>
        <p>{mensaje.contenido}</p>
      </div>
    );
  }

  return (
    <div className={estilos.respuesta}>
      {esperando ? (
        <p className={estilos.esperando} role="status">
          {mensaje.fuentes?.length
            ? `Leyendo ${mensaje.fuentes.length} fragmentos de tus documentos…`
            : "Buscando en tus documentos…"}
        </p>
      ) : (
        <TextoRespuesta
          texto={mensaje.contenido}
          fuentes={fuentes}
          indicePorNumero={indicePorNumero}
          onCitar={onCitar}
          escribiendo={mensaje.enCurso}
        />
      )}

      {mensaje.interrumpida && <p className={estilos.nota}>Respuesta incompleta: se detuvo antes de terminar.</p>}
      {mensaje.error && (
        <p className="aviso-error" role="alert">
          {mensaje.error}
        </p>
      )}

      {!mensaje.enCurso && notas.length > 0 && (
        <div className={estilos.fuentes}>
          <span className="etiqueta">Fuentes</span>
          <div className={estilos.chips}>
            {notas.map(({ indice, fuente }) => (
              <button
                key={indice}
                type="button"
                className={estilos.chip}
                onClick={() => onCitar(fuente)}
                title={fuente.extracto}
              >
                <span className={estilos.indice}>{indice}</span>
                {quitarExtension(fuente.documento)} <span className="num">p. {fuente.pagina}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

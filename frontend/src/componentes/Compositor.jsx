/*
  Caja para escribir la pregunta.
  - Enter envía; Shift+Enter hace un salto de línea.
  - Crece con el texto hasta unas 6 líneas.
  - Mientras llega una respuesta, el botón cambia a "Detener".
*/
import { useEffect, useRef, useState } from "react";
import estilos from "./Compositor.module.css";

const MAXIMO = 2000;

export default function Compositor({ escribiendo, deshabilitado, marcador, onEnviar, onDetener }) {
  const [texto, setTexto] = useState("");
  const area = useRef(null);

  // Ajusta la altura al contenido cada vez que cambia el texto
  useEffect(() => {
    const elemento = area.current;
    elemento.style.height = "auto";
    elemento.style.height = `${Math.min(elemento.scrollHeight, 168)}px`;
  }, [texto]);

  useEffect(() => {
    if (!escribiendo && !deshabilitado) area.current.focus();
  }, [escribiendo, deshabilitado]);

  function enviar() {
    const pregunta = texto.trim();
    if (!pregunta || escribiendo || deshabilitado) return;
    onEnviar(pregunta);
    setTexto("");
  }

  return (
    <form
      className={estilos.compositor}
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      <label htmlFor="pregunta" className="solo-lector">
        Tu pregunta
      </label>
      <textarea
        ref={area}
        id="pregunta"
        className={estilos.area}
        rows={1}
        value={texto}
        maxLength={MAXIMO}
        placeholder={marcador}
        disabled={deshabilitado}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          // isComposing: no enviar mientras se escribe un acento con teclas muertas
          if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
            evento.preventDefault();
            enviar();
          }
        }}
      />
      {texto.length > MAXIMO - 200 && <span className={`${estilos.contador} num`}>{MAXIMO - texto.length}</span>}
      {escribiendo ? (
        <button className="boton boton-secundario boton-chico" type="button" onClick={onDetener}>
          Detener
        </button>
      ) : (
        <button className="boton boton-primario boton-chico" type="submit" disabled={!texto.trim() || deshabilitado}>
          Enviar
        </button>
      )}
    </form>
  );
}

/*
  Diálogo de confirmación basado en <dialog>, el elemento nativo de HTML.
  Con showModal() el navegador ya resuelve lo difícil: oscurece el fondo,
  atrapa el foco del teclado dentro del diálogo y lo cierra con Esc.
*/
import { useEffect, useRef } from "react";
import estilos from "./Dialogo.module.css";

export default function Dialogo({ abierto, titulo, children, textoConfirmar, ocupado, onConfirmar, onCancelar }) {
  // useRef nos da acceso directo al elemento <dialog> del DOM
  const referencia = useRef(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referencia}
      className={estilos.dialogo}
      aria-labelledby="dialogo-titulo"
      // "cancel" se dispara al presionar Esc
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) onCancelar();
      }}
    >
      <h2 id="dialogo-titulo" className={estilos.titulo}>
        {titulo}
      </h2>
      <div className={estilos.cuerpo}>{children}</div>
      <div className={estilos.acciones}>
        <button className="boton boton-fantasma" type="button" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </button>
        <button className="boton boton-peligro-lleno" type="button" onClick={onConfirmar} disabled={ocupado}>
          {ocupado ? "Borrando…" : textoConfirmar}
        </button>
      </div>
    </dialog>
  );
}

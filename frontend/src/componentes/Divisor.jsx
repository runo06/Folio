/*
  Barra vertical entre el chat y el visor que se puede arrastrar.

  Pointer events (pointerdown/move/up) funcionan igual con mouse, dedo o
  lápiz. setPointerCapture hace que sigamos recibiendo el movimiento
  aunque el puntero se salga de la barra mientras arrastras.
  También se puede mover con las flechas del teclado.
*/
import estilos from "./Divisor.module.css";

const MINIMO = 30;
const MAXIMO = 70;

export default function Divisor({ porcentaje, contenedor, onCambiar }) {
  function limitar(valor) {
    return Math.min(MAXIMO, Math.max(MINIMO, valor));
  }

  function alPresionar(evento) {
    evento.preventDefault();
    const barra = evento.currentTarget;
    barra.setPointerCapture(evento.pointerId);
    const caja = contenedor.current.getBoundingClientRect();

    const alMover = (movimiento) => {
      onCambiar(limitar(((movimiento.clientX - caja.left) / caja.width) * 100));
    };
    const alSoltar = () => {
      barra.removeEventListener("pointermove", alMover);
      barra.removeEventListener("pointerup", alSoltar);
      barra.removeEventListener("pointercancel", alSoltar);
    };
    barra.addEventListener("pointermove", alMover);
    barra.addEventListener("pointerup", alSoltar);
    barra.addEventListener("pointercancel", alSoltar);
  }

  return (
    <div
      className={estilos.divisor}
      role="separator"
      aria-orientation="vertical"
      aria-label="Cambiar el ancho del chat y del documento"
      aria-valuemin={MINIMO}
      aria-valuemax={MAXIMO}
      aria-valuenow={Math.round(porcentaje)}
      tabIndex={0}
      onPointerDown={alPresionar}
      onDoubleClick={() => onCambiar(50)}
      onKeyDown={(evento) => {
        if (evento.key === "ArrowLeft") onCambiar(limitar(porcentaje - 3));
        if (evento.key === "ArrowRight") onCambiar(limitar(porcentaje + 3));
      }}
    >
      <span className={estilos.asa} aria-hidden="true" />
    </div>
  );
}

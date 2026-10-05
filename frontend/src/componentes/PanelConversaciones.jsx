/*
  Historial de conversaciones de una colección: elegir, renombrar y borrar.
  En pantallas medianas es un panel que se abre sobre el chat; en
  pantallas muy anchas queda fijo a la izquierda (lo decide el CSS).
*/
import { useEffect, useRef, useState } from "react";
import { conversaciones as api } from "../api/chat";
import { useAvisos } from "../contexto/AvisosContexto";
import { mensajeDeError } from "../utilidades/formato";
import Dialogo from "./Dialogo";
import estilos from "./PanelConversaciones.module.css";

const DIA = 24 * 60 * 60 * 1000;

// Agrupa por fecha: Hoy, Ayer, Últimos 7 días, Antes
function agrupar(lista) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const grupos = [
    { titulo: "Hoy", desde: hoy.getTime(), elementos: [] },
    { titulo: "Ayer", desde: hoy.getTime() - DIA, elementos: [] },
    { titulo: "Últimos 7 días", desde: hoy.getTime() - 7 * DIA, elementos: [] },
    { titulo: "Antes", desde: -Infinity, elementos: [] },
  ];
  for (const conversacion of lista) {
    const fecha = new Date(conversacion.actualizada).getTime();
    grupos.find((grupo) => fecha >= grupo.desde).elementos.push(conversacion);
  }
  return grupos.filter((grupo) => grupo.elementos.length);
}

function Renombrar({ conversacion, onGuardar, onCancelar }) {
  const [titulo, setTitulo] = useState(conversacion.titulo);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef(null);
  // Enter (submit) y salir del campo (blur) llaman a guardar: solo cuenta el primero
  const yaGuardo = useRef(false);

  useEffect(() => {
    campo.current.focus();
    campo.current.select();
  }, []);

  async function guardar() {
    if (yaGuardo.current) return;
    yaGuardo.current = true;
    const limpio = titulo.trim();
    if (!limpio || limpio === conversacion.titulo) return onCancelar();
    setGuardando(true);
    try {
      await onGuardar(limpio);
    } catch {
      setGuardando(false);
      yaGuardo.current = false;
    }
  }

  return (
    <form
      className={estilos.renombrar}
      onSubmit={(evento) => {
        evento.preventDefault();
        guardar();
      }}
    >
      <label className="solo-lector" htmlFor={`titulo-${conversacion.id}`}>
        Nuevo título
      </label>
      <input
        ref={campo}
        id={`titulo-${conversacion.id}`}
        className="entrada"
        value={titulo}
        maxLength={120}
        disabled={guardando}
        onChange={(evento) => setTitulo(evento.target.value)}
        onKeyDown={(evento) => evento.key === "Escape" && (evento.stopPropagation(), onCancelar())}
        onBlur={guardar}
      />
    </form>
  );
}

export default function PanelConversaciones({ idColeccion, activa, version, abierto, onCerrar, onElegir, onNueva, onCambio }) {
  const avisar = useAvisos();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null);
  const [porBorrar, setPorBorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);
  const panel = useRef(null);

  // Se vuelve a pedir cuando cambia `version` (nueva conversación, respuesta terminada…)
  useEffect(() => {
    let vigente = true;
    api
      .listar(idColeccion)
      .then((datos) => vigente && (setLista(datos), setError(null)))
      .catch((fallo) => vigente && setError(mensajeDeError(fallo)));
    return () => {
      vigente = false;
    };
  }, [idColeccion, version]);

  // Al abrirse, el foco pasa al panel (para quien navega con teclado)
  useEffect(() => {
    if (abierto) panel.current?.focus();
  }, [abierto]);

  async function renombrar(conversacion, titulo) {
    try {
      const actualizada = await api.renombrar(conversacion.id, titulo);
      setLista((actual) => actual.map((c) => (c.id === actualizada.id ? { ...c, ...actualizada } : c)));
      onCambio({ tipo: "renombrada", conversacion: actualizada });
    } catch (fallo) {
      avisar(mensajeDeError(fallo), "error");
      throw fallo;
    } finally {
      setEditando(null);
    }
  }

  async function borrar() {
    setBorrando(true);
    try {
      await api.borrar(porBorrar.id);
      setLista((actual) => actual.filter((c) => c.id !== porBorrar.id));
      onCambio({ tipo: "borrada", id: porBorrar.id });
      avisar("Conversación borrada.");
      setPorBorrar(null);
    } catch (fallo) {
      avisar(mensajeDeError(fallo), "error");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      className={`${estilos.panel} ${abierto ? estilos.abierto : ""}`}
      aria-label="Conversaciones"
      onKeyDown={(evento) => evento.key === "Escape" && onCerrar()}
    >
      <div className={estilos.cabeza}>
        <h2>Conversaciones</h2>
        <button type="button" className={`${estilos.cerrar} boton boton-fantasma boton-chico`} onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <button type="button" className={`${estilos.nueva} boton boton-secundario boton-chico`} onClick={onNueva}>
        + Nueva conversación
      </button>

      <div className={estilos.lista}>
        {error && <p className="aviso-error">{error}</p>}

        {!error && lista === null && (
          <div className={estilos.fantasmas} aria-hidden="true">
            {[70, 90, 55, 80].map((ancho, i) => (
              <span key={i} style={{ width: `${ancho}%` }} />
            ))}
          </div>
        )}

        {lista?.length === 0 && (
          <p className={estilos.vacia}>Aún no hay conversaciones. Tu primera pregunta empieza una.</p>
        )}

        {lista &&
          agrupar(lista).map((grupo) => (
            <section key={grupo.titulo} className={estilos.grupo}>
              <h3 className="etiqueta">{grupo.titulo}</h3>
              <ul>
                {grupo.elementos.map((conversacion) => (
                  <li key={conversacion.id} className={conversacion.id === activa ? estilos.activa : ""}>
                    {editando === conversacion.id ? (
                      <Renombrar
                        conversacion={conversacion}
                        onGuardar={(titulo) => renombrar(conversacion, titulo)}
                        onCancelar={() => setEditando(null)}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={estilos.elegir}
                          onClick={() => onElegir(conversacion.id)}
                          aria-current={conversacion.id === activa ? "true" : undefined}
                        >
                          <span className={estilos.titulo}>{conversacion.titulo}</span>
                          <span className={`${estilos.detalle} num`}>
                            {Math.ceil(conversacion.total_mensajes / 2)} preg.
                          </span>
                        </button>
                        <div className={estilos.acciones}>
                          <button type="button" onClick={() => setEditando(conversacion.id)} aria-label={`Renombrar «${conversacion.titulo}»`}>
                            Renombrar
                          </button>
                          <button type="button" onClick={() => setPorBorrar(conversacion)} aria-label={`Borrar «${conversacion.titulo}»`}>
                            Borrar
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      <Dialogo
        abierto={Boolean(porBorrar)}
        titulo={porBorrar ? `¿Borrar «${porBorrar.titulo}»?` : ""}
        textoConfirmar="Borrar conversación"
        ocupado={borrando}
        onConfirmar={borrar}
        onCancelar={() => setPorBorrar(null)}
      >
        <p>Se borrarán todas sus preguntas y respuestas. Tus documentos no se tocan.</p>
      </Dialogo>
    </aside>
  );
}

/*
  Pantalla principal: chat a la izquierda, visor de PDF a la derecha.

  Lo que se está viendo vive en la URL, para poder recargar o compartir:
    /colecciones/3/chat?c=11&doc=7&p=12
      c   -> conversación abierta
      doc -> documento abierto en el visor
      p   -> página del visor
*/
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { conversaciones, preguntar } from "../api/chat";
import { colecciones as apiColecciones, documentos as apiDocumentos } from "../api/folio";
import Compositor from "../componentes/Compositor";
import Divisor from "../componentes/Divisor";
import MensajeChat from "../componentes/MensajeChat";
import PanelConversaciones from "../componentes/PanelConversaciones";
import { useAvisos } from "../contexto/AvisosContexto";
import { mensajeDeError, plural } from "../utilidades/formato";
import useConsultaMedia from "../utilidades/useConsultaMedia";
import estilos from "./Chat.module.css";

const CLAVE_ANCHO = "folio.anchoChat";

// PDF.js pesa casi 1 MB: con lazy() Vite lo separa en otro archivo que el
// navegador descarga solo al abrir esta pantalla, no al entrar a Folio.
const VisorPdf = lazy(() => import("../componentes/VisorPdf"));

// De una respuesta cortada, solo las fuentes que el texto alcanzó a citar
function citadasEnTexto(texto, fuentes) {
  const numeros = new Set([...texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return fuentes.filter((fuente) => numeros.has(fuente.numero));
}

// localStorage puede fallar (modo privado, almacenamiento bloqueado): nunca debe romper la app
function leerAncho() {
  try {
    return Number(localStorage.getItem(CLAVE_ANCHO)) || 46;
  } catch {
    return 46;
  }
}

export default function Chat() {
  const { id } = useParams();
  const [parametros, setParametros] = useSearchParams();
  const idConversacion = Number(parametros.get("c")) || null;
  const avisar = useAvisos();
  const esAngosta = useConsultaMedia("(max-width: 899px)");

  const [coleccion, setColeccion] = useState(null);
  const [listos, setListos] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [titulo, setTitulo] = useState(null);
  const [cargandoConversacion, setCargandoConversacion] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [pestana, setPestana] = useState("chat"); // solo en celular: "chat" | "documento"
  const [anchoChat, setAnchoChat] = useState(leerAncho);
  // Lo que el visor debe mostrar. Se inicia con la URL y cambia con cada
  // navegación (cita, flechas…). `clave` distingue dos clics a la misma página.
  const [destino, setDestino] = useState(() => {
    const documento = Number(parametros.get("doc")) || null;
    return documento ? { documento, pagina: Number(parametros.get("p")) || 1, texto: null, clave: 0 } : null;
  });

  const controlador = useRef(null);
  const conversacionCargada = useRef(null);
  const hilo = useRef(null);
  const espacio = useRef(null);

  // Cambia algunos parámetros de la URL sin tocar los demás ni crear historial
  const actualizarUrl = useCallback(
    (cambios) => {
      setParametros(
        (actuales) => {
          const nuevos = new URLSearchParams(actuales);
          for (const [clave, valor] of Object.entries(cambios)) {
            if (valor === null || valor === undefined) nuevos.delete(clave);
            else nuevos.set(clave, String(valor));
          }
          return nuevos;
        },
        { replace: true },
      );
    },
    [setParametros],
  );

  // ---------- Datos de la colección ----------
  useEffect(() => {
    let vigente = true;
    Promise.all([apiColecciones.obtener(id), apiDocumentos.listar(id)])
      .then(([datosColeccion, documentos]) => {
        if (!vigente) return;
        setColeccion(datosColeccion);
        setListos(documentos.filter((documento) => documento.estado === "listo"));
      })
      .catch((error) => {
        if (vigente) {
          setErrorCarga(error.response?.status === 404 ? "Esta colección no existe o no es tuya." : mensajeDeError(error));
        }
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  // ---------- Abrir una conversación (?c=...) ----------
  useEffect(() => {
    if (!idConversacion) {
      conversacionCargada.current = null;
      setMensajes([]);
      setTitulo(null);
      return;
    }
    if (conversacionCargada.current === idConversacion) return;

    let vigente = true;
    setCargandoConversacion(true);
    conversaciones
      .obtener(idConversacion)
      .then((datos) => {
        if (!vigente) return;
        conversacionCargada.current = datos.id;
        setMensajes(datos.mensajes);
        setTitulo(datos.titulo);
        // Al abrirla, mostramos el final de la conversación
        requestAnimationFrame(() => hilo.current?.scrollTo({ top: hilo.current.scrollHeight }));
      })
      .catch(() => {
        if (!vigente) return;
        avisar("Esa conversación ya no existe.", "error");
        actualizarUrl({ c: null });
      })
      .finally(() => vigente && setCargandoConversacion(false));
    return () => {
      vigente = false;
    };
  }, [idConversacion, avisar, actualizarUrl]);

  // ---------- Seguir el final mientras llega texto ----------
  useEffect(() => {
    const elemento = hilo.current;
    if (!elemento || !escribiendo) return;
    const cercaDelFinal = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight < 160;
    if (cercaDelFinal) elemento.scrollTop = elemento.scrollHeight;
  }, [mensajes, escribiendo]);

  // Si sales de la página a media respuesta, la cortamos
  useEffect(() => () => controlador.current?.abort(), []);

  function guardarAncho(valor) {
    setAnchoChat(valor);
    try {
      localStorage.setItem(CLAVE_ANCHO, String(Math.round(valor)));
    } catch {
      /* sin almacenamiento: el ancho solo dura esta visita */
    }
  }

  // ---------- Preguntar ----------
  function actualizarRespuesta(cambio) {
    setMensajes((actuales) => {
      const copia = [...actuales];
      const ultimo = copia.length - 1;
      copia[ultimo] = { ...copia[ultimo], ...(typeof cambio === "function" ? cambio(copia[ultimo]) : cambio) };
      return copia;
    });
  }

  async function enviar(pregunta) {
    const ahora = Date.now();
    setMensajes((actuales) => [
      ...actuales,
      { id: `p-${ahora}`, rol: "usuario", contenido: pregunta },
      { id: `r-${ahora}`, rol: "asistente", contenido: "", fuentes: [], citas: [], enCurso: true },
    ]);
    setEscribiendo(true);
    requestAnimationFrame(() => hilo.current?.scrollTo({ top: hilo.current.scrollHeight, behavior: "smooth" }));
    controlador.current = new AbortController();

    try {
      await preguntar({
        idColeccion: id,
        pregunta,
        conversacion: idConversacion,
        senal: controlador.current.signal,
        alEvento: (tipo, datos) => {
          if (tipo === "inicio") {
            conversacionCargada.current = datos.conversacion.id;
            setTitulo(datos.conversacion.titulo);
            if (datos.conversacion.id !== idConversacion) {
              actualizarUrl({ c: datos.conversacion.id });
              setVersionHistorial((v) => v + 1); // aparece en el historial
            }
          } else if (tipo === "fuentes") {
            actualizarRespuesta({ fuentes: datos });
          } else if (tipo === "texto") {
            actualizarRespuesta((anterior) => ({ contenido: anterior.contenido + datos.delta }));
          } else if (tipo === "fin") {
            actualizarRespuesta({ ...datos.mensaje, enCurso: false });
            setVersionHistorial((v) => v + 1); // sube al primer lugar
          } else if (tipo === "error") {
            actualizarRespuesta((anterior) => ({
              enCurso: false,
              error: datos.mensaje,
              interrumpida: Boolean(anterior.contenido),
              citas: citadasEnTexto(anterior.contenido, anterior.fuentes),
            }));
          }
        },
      });
    } catch (error) {
      if (error.name === "AbortError") {
        actualizarRespuesta((anterior) => ({
          enCurso: false,
          interrumpida: true,
          citas: citadasEnTexto(anterior.contenido, anterior.fuentes),
        }));
      } else if (!error.response) {
        actualizarRespuesta({ enCurso: false, error: "Se perdió la conexión con el servidor. Inténtalo de nuevo." });
      } else {
        actualizarRespuesta({ enCurso: false, error: mensajeDeError(error) });
      }
    } finally {
      setEscribiendo(false);
      controlador.current = null;
    }
  }

  // ---------- Navegación del visor ----------
  const navegar = useCallback(
    ({ documento, pagina, texto = null }) => {
      setDestino({ documento, pagina, texto, clave: Date.now() });
      actualizarUrl({ doc: documento, p: pagina });
    },
    [actualizarUrl],
  );

  function abrirCita(cita) {
    navegar({ documento: cita.documento_id, pagina: cita.pagina, texto: cita.extracto });
    setPestana("documento"); // en celular, cambia a la pestaña del documento
  }

  const alPaginaVisible = useCallback((pagina) => actualizarUrl({ p: pagina }), [actualizarUrl]);

  // ---------- Historial ----------
  function elegirConversacion(idElegida) {
    if (escribiendo) controlador.current?.abort();
    setHistorialAbierto(false);
    if (idElegida !== idConversacion) actualizarUrl({ c: idElegida });
  }

  function nuevaConversacion() {
    controlador.current?.abort();
    setHistorialAbierto(false);
    actualizarUrl({ c: null });
  }

  function alCambiarHistorial(cambio) {
    if (cambio.tipo === "renombrada" && cambio.conversacion.id === idConversacion) setTitulo(cambio.conversacion.titulo);
    if (cambio.tipo === "borrada" && cambio.id === idConversacion) nuevaConversacion();
  }

  // ---------- Dibujo ----------
  if (errorCarga) {
    return (
      <div className={estilos.problema}>
        <p className="aviso-error">{errorCarga}</p>
        <Link to="/colecciones">← Volver a tus colecciones</Link>
      </div>
    );
  }
  if (!coleccion) {
    return (
      <p className={estilos.cargando} role="status">
        Abriendo la colección…
      </p>
    );
  }

  const sinDocumentos = listos.length === 0;

  return (
    <div className={estilos.espacio} ref={espacio} style={{ "--ancho-chat": `${anchoChat}%` }}>
      {/* Pestañas: solo se ven en pantallas angostas */}
      <div className={estilos.pestanas} role="tablist" aria-label="Vista">
        {[
          ["chat", "Chat"],
          ["documento", "Documento"],
        ].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            id={`pestana-${valor}`}
            aria-selected={pestana === valor}
            aria-controls={`panel-${valor}`}
            className={estilos.pestana}
            onClick={() => setPestana(valor)}
          >
            {texto}
          </button>
        ))}
      </div>

      <section
        id="panel-chat"
        role="tabpanel"
        aria-labelledby="pestana-chat"
        className={estilos.panelChat}
        data-activo={pestana === "chat"}
      >
        <PanelConversaciones
          idColeccion={id}
          activa={idConversacion}
          version={versionHistorial}
          abierto={historialAbierto}
          onCerrar={() => setHistorialAbierto(false)}
          onElegir={elegirConversacion}
          onNueva={nuevaConversacion}
          onCambio={alCambiarHistorial}
        />

        <div className={estilos.columnaChat}>
          <header className={estilos.barra}>
            <button
              type="button"
              className={`${estilos.botonHistorial} boton boton-fantasma boton-chico`}
              onClick={() => setHistorialAbierto(true)}
              aria-expanded={historialAbierto}
            >
              <span aria-hidden="true">☰</span> Conversaciones
            </button>
            <div className={estilos.titulos}>
              <Link to={`/colecciones/${id}`} className={estilos.migas}>
                {coleccion.nombre}
              </Link>
              <h1>{titulo ?? "Nueva conversación"}</h1>
            </div>
            {mensajes.length > 0 && (
              <button type="button" className="boton boton-secundario boton-chico" onClick={nuevaConversacion}>
                + Nueva
              </button>
            )}
          </header>

          <div className={estilos.hilo} ref={hilo} aria-live="polite">
            {cargandoConversacion && (
              <p className={estilos.cargando} role="status">
                Abriendo conversación…
              </p>
            )}

            {!cargandoConversacion && mensajes.length === 0 && (
              <div className={estilos.vacio}>
                {sinDocumentos ? (
                  <>
                    <h2>Todavía no hay documentos listos</h2>
                    <p>
                      Sube un PDF a <Link to={`/colecciones/${id}`}>{coleccion.nombre}</Link> y espera a que aparezca
                      como «Listo». Después podrás preguntar aquí.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>Pregunta lo que quieras sobre {coleccion.nombre}</h2>
                    <p>
                      Folio busca en {plural(listos.length, "documento")} y responde solo con lo que encuentra en
                      ellos. Toca una cita para ver la página de donde salió.
                    </p>
                  </>
                )}
              </div>
            )}

            {mensajes.map((mensaje) => (
              <MensajeChat key={mensaje.id} mensaje={mensaje} onCitar={abrirCita} />
            ))}
          </div>

          <div className={estilos.pie}>
            <Compositor
              escribiendo={escribiendo}
              deshabilitado={sinDocumentos || cargandoConversacion}
              marcador={sinDocumentos ? "Primero sube un documento" : `Pregunta sobre «${coleccion.nombre}»…`}
              onEnviar={enviar}
              onDetener={() => controlador.current?.abort()}
            />
            <p className={estilos.aviso}>Respuestas generadas con IA a partir de tus documentos. Revisa las citas.</p>
          </div>
        </div>
      </section>

      <Divisor porcentaje={anchoChat} contenedor={espacio} onCambiar={guardarAncho} />

      <section
        id="panel-documento"
        role="tabpanel"
        aria-labelledby="pestana-documento"
        className={estilos.panelVisor}
        data-activo={pestana === "documento"}
      >
        <Suspense fallback={<p className={estilos.cargando}>Preparando el visor…</p>}>
          <VisorPdf
            documentos={listos}
            destino={destino}
            activo={pestana === "documento" || !esAngosta}
            onNavegar={navegar}
            onPaginaVisible={alPaginaVisible}
          />
        </Suspense>
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { conversaciones, preguntar } from "../api/chat";
import { colecciones as apiColecciones, documentos as apiDocumentos } from "../api/folio";
import Compositor from "../componentes/Compositor";
import MensajeChat from "../componentes/MensajeChat";
import { useAvisos } from "../contexto/AvisosContexto";
import { abrirPdf } from "../utilidades/abrirPdf";
import { mensajeDeError, plural } from "../utilidades/formato";
import estilos from "./Chat.module.css";

// De una respuesta cortada, solo las fuentes que el texto alcanzó a citar
function citadasEnTexto(texto, fuentes) {
  const numeros = new Set([...texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return fuentes.filter((fuente) => numeros.has(fuente.numero));
}

export default function Chat() {
  const { id } = useParams();
  // La conversación abierta vive en la URL (?c=12): se puede recargar o compartir
  const [parametros, setParametros] = useSearchParams();
  const idConversacion = Number(parametros.get("c")) || null;
  const avisar = useAvisos();

  const [coleccion, setColeccion] = useState(null);
  const [listos, setListos] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [cargandoConversacion, setCargandoConversacion] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);

  const controlador = useRef(null); // AbortController de la respuesta en curso
  const conversacionCargada = useRef(null); // evita recargar la que acabamos de crear
  const final = useRef(null);

  // Datos de la colección y sus documentos listos
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

  // Al abrir una conversación existente (?c=...), traemos sus mensajes
  useEffect(() => {
    if (!idConversacion) {
      conversacionCargada.current = null;
      setMensajes([]);
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
      })
      .catch(() => {
        if (!vigente) return;
        avisar("No se encontró esa conversación.", "error");
        setParametros({}, { replace: true });
      })
      .finally(() => vigente && setCargandoConversacion(false));
    return () => {
      vigente = false;
    };
  }, [idConversacion, avisar, setParametros]);

  // Si estás al final de la página, la seguimos mientras llega el texto
  useEffect(() => {
    const cercaDelFinal = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
    if (escribiendo && cercaDelFinal) final.current?.scrollIntoView({ block: "end" });
  }, [mensajes, escribiendo]);

  // Si sales de la página a media respuesta, la cortamos
  useEffect(() => () => controlador.current?.abort(), []);

  // Cambia solo la última respuesta (la que se está escribiendo)
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
            setParametros({ c: String(datos.conversacion.id) }, { replace: true });
          } else if (tipo === "fuentes") {
            actualizarRespuesta({ fuentes: datos });
          } else if (tipo === "texto") {
            actualizarRespuesta((anterior) => ({ contenido: anterior.contenido + datos.delta }));
          } else if (tipo === "fin") {
            actualizarRespuesta({ ...datos.mensaje, enCurso: false });
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
        // Lo detuviste tú: el backend guarda lo que alcanzó a escribir
        actualizarRespuesta((anterior) => ({
          enCurso: false,
          interrumpida: true,
          citas: citadasEnTexto(anterior.contenido, anterior.fuentes),
        }));
      } else {
        actualizarRespuesta({ enCurso: false, error: mensajeDeError(error) });
      }
    } finally {
      setEscribiendo(false);
      controlador.current = null;
    }
  }

  async function abrirCita(cita) {
    try {
      await abrirPdf(cita.documento_id, cita.pagina);
    } catch (error) {
      avisar(mensajeDeError(error), "error");
    }
  }

  function nuevaConversacion() {
    controlador.current?.abort();
    setParametros({});
  }

  if (errorCarga) {
    return (
      <div className={estilos.problema}>
        <p className="aviso-error">{errorCarga}</p>
        <Link to="/colecciones">← Volver a tus colecciones</Link>
      </div>
    );
  }
  if (!coleccion) return <p className={estilos.cargando}>Cargando…</p>;

  const sinDocumentos = listos.length === 0;

  return (
    <div className={estilos.chat}>
      <div className={estilos.encabezado}>
        <div>
          <nav className={estilos.migas} aria-label="Ruta">
            <Link to="/colecciones">Colecciones</Link>
            <span aria-hidden="true">/</span>
            <Link to={`/colecciones/${id}`}>{coleccion.nombre}</Link>
            <span aria-hidden="true">/</span>
          </nav>
          <h1>Preguntar</h1>
        </div>
        {mensajes.length > 0 && (
          <button className="boton boton-secundario boton-chico" type="button" onClick={nuevaConversacion}>
            Nueva conversación
          </button>
        )}
      </div>

      <div className={estilos.hilo} aria-live="polite">
        {cargandoConversacion && <p className={estilos.cargando}>Abriendo conversación…</p>}

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
                  Folio busca en {plural(listos.length, "documento")} y responde solo con lo que encuentra en ellos,
                  citando el documento y la página. Si la respuesta no está, te lo dice.
                </p>
                <ul className={estilos.documentos}>
                  {listos.slice(0, 6).map((documento) => (
                    <li key={documento.id}>
                      {documento.nombre_original} <span className="num">· {documento.num_paginas} págs</span>
                    </li>
                  ))}
                  {listos.length > 6 && <li>y {plural(listos.length - 6, "documento")} más</li>}
                </ul>
              </>
            )}
          </div>
        )}

        {mensajes.map((mensaje) => (
          <MensajeChat key={mensaje.id} mensaje={mensaje} onCitar={abrirCita} />
        ))}
        <div ref={final} />
      </div>

      <div className={estilos.pie}>
        <Compositor
          escribiendo={escribiendo}
          deshabilitado={sinDocumentos || cargandoConversacion}
          marcador={sinDocumentos ? "Primero sube un documento" : `Pregunta sobre «${coleccion.nombre}»…`}
          onEnviar={enviar}
          onDetener={() => controlador.current?.abort()}
        />
        <p className={estilos.aviso}>Las respuestas se generan con IA a partir de tus documentos. Revisa las citas.</p>
      </div>
    </div>
  );
}

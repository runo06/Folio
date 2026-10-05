import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { colecciones as apiColecciones, documentos as apiDocumentos } from "../api/folio";
import ColaSubidas from "../componentes/ColaSubidas";
import Dialogo from "../componentes/Dialogo";
import FormularioColeccion from "../componentes/FormularioColeccion";
import TablaDocumentos from "../componentes/TablaDocumentos";
import ZonaSubida from "../componentes/ZonaSubida";
import { useAvisos } from "../contexto/AvisosContexto";
import { abrirPdf, olvidarPdf } from "../utilidades/abrirPdf";
import { mensajeDeError, plural } from "../utilidades/formato";
import estilos from "./Coleccion.module.css";

// Debe coincidir con FOLIO_TAMANO_MAXIMO_MB del backend. Revisarlo aquí
// solo sirve para avisar al instante; el backend vuelve a validar siempre.
const LIMITE_MB = 25;
// Cada cuánto preguntamos por los documentos que se están procesando
const INTERVALO_MS = 3000;
const EN_CURSO = ["pendiente", "procesando"];

function validarAntesDeSubir(archivo) {
  if (!archivo.name.toLowerCase().endsWith(".pdf")) return "Solo se aceptan archivos PDF.";
  if (archivo.size > LIMITE_MB * 1024 * 1024) return `El archivo pesa más de ${LIMITE_MB} MB.`;
  return null;
}

export default function Coleccion() {
  // useParams lee la parte variable de la URL: /colecciones/:id
  const { id } = useParams();
  const navegar = useNavigate();
  const avisar = useAvisos();

  const [coleccion, setColeccion] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);
  const [editando, setEditando] = useState(false);
  const [subidas, setSubidas] = useState([]);
  const [abriendo, setAbriendo] = useState(null);
  const [reintentando, setReintentando] = useState(null);
  // Qué se está por borrar: { tipo: "coleccion" } o { tipo: "documento", documento }
  const [porBorrar, setPorBorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);

  const siguienteIdSubida = useRef(1);
  // Cadena de promesas: cada subida espera a que termine la anterior,
  // así los archivos se suben de uno en uno y en orden.
  const colaSubidas = useRef(Promise.resolve());
  // Copia de la lista que el temporizador puede leer sin quedarse con una
  // versión vieja (las funciones "recuerdan" los valores de cuando se crearon)
  const documentosActuales = useRef(documentos);
  useEffect(() => {
    documentosActuales.current = documentos;
  }, [documentos]);

  // Cuando cambia el id de la URL, cargamos la colección y sus documentos
  // en paralelo (Promise.all espera a las dos peticiones).
  useEffect(() => {
    let vigente = true;
    setColeccion(null);
    setErrorCarga(null);
    Promise.all([apiColecciones.obtener(id), apiDocumentos.listar(id)])
      .then(([datosColeccion, datosDocumentos]) => {
        if (!vigente) return;
        setColeccion(datosColeccion);
        setDocumentos(datosDocumentos);
      })
      .catch((error) => {
        if (!vigente) return;
        setErrorCarga(
          error.response?.status === 404 ? "Esta colección no existe o no es tuya." : mensajeDeError(error),
        );
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  // ---------- Seguimiento del procesamiento (polling) ----------
  // Mientras haya documentos pendientes o procesándose, preguntamos al
  // backend cada 3 segundos. Cuando ya no hay, el efecto se limpia solo:
  // hayEnCurso pasa a false y React ejecuta la función de limpieza.
  const hayEnCurso = documentos.some((documento) => EN_CURSO.includes(documento.estado));

  useEffect(() => {
    if (!hayEnCurso) return;

    const temporizador = setInterval(async () => {
      let frescos;
      try {
        frescos = await apiDocumentos.listar(id);
      } catch {
        return; // sin conexión por un momento: lo intentamos en la siguiente vuelta
      }

      const estadosAntes = new Map(documentosActuales.current.map((d) => [d.id, d.estado]));
      for (const documento of frescos) {
        if (!EN_CURSO.includes(estadosAntes.get(documento.id))) continue;
        if (documento.estado === "listo") avisar(`«${documento.nombre_original}» está listo.`);
        if (documento.estado === "error") avisar(`«${documento.nombre_original}» no se pudo procesar.`, "error");
      }

      setDocumentos((actuales) => {
        // Conservamos los que se subieron mientras esta consulta viajaba
        const idMaximo = Math.max(0, ...frescos.map((d) => d.id));
        const recienSubidos = actuales.filter((d) => d.id > idMaximo);
        return [...recienSubidos, ...frescos];
      });
    }, INTERVALO_MS);

    return () => clearInterval(temporizador);
  }, [hayEnCurso, id, avisar]);

  async function reintentar(documento) {
    setReintentando(documento.id);
    try {
      const actualizado = await apiDocumentos.reprocesar(documento.id);
      setDocumentos((actuales) => actuales.map((d) => (d.id === actualizado.id ? actualizado : d)));
    } catch (error) {
      avisar(mensajeDeError(error), "error");
    } finally {
      setReintentando(null);
    }
  }

  // ---------- Subidas ----------
  function actualizarSubida(idSubida, cambios) {
    setSubidas((actuales) => actuales.map((s) => (s.id === idSubida ? { ...s, ...cambios } : s)));
  }

  function quitarSubida(idSubida) {
    setSubidas((actuales) => actuales.filter((s) => s.id !== idSubida));
  }

  async function subirUno(subida, archivo) {
    actualizarSubida(subida.id, { progreso: 0 });
    try {
      const documento = await apiDocumentos.subir(id, archivo, (progreso) =>
        actualizarSubida(subida.id, { progreso }),
      );
      quitarSubida(subida.id);
      setDocumentos((actuales) => [documento, ...actuales]);
      setColeccion((actual) => ({
        ...actual,
        total_documentos: actual.total_documentos + 1,
        total_paginas: actual.total_paginas + documento.num_paginas,
      }));
      avisar(`«${documento.nombre_original}» se subió. ${plural(documento.num_paginas, "página")}.`);
    } catch (error) {
      actualizarSubida(subida.id, { error: mensajeDeError(error), progreso: null });
    }
  }

  function agregarArchivos(archivos) {
    const nuevas = archivos.map((archivo) => ({
      archivo,
      subida: {
        id: siguienteIdSubida.current++,
        nombre: archivo.name,
        tamano: archivo.size,
        progreso: null,
        error: validarAntesDeSubir(archivo),
      },
    }));

    setSubidas((actuales) => [...actuales, ...nuevas.map((n) => n.subida)]);

    for (const { archivo, subida } of nuevas) {
      if (subida.error) continue;
      colaSubidas.current = colaSubidas.current.then(() => subirUno(subida, archivo));
    }
  }

  // ---------- Abrir un PDF ----------
  async function abrir(documento) {
    setAbriendo(documento.id);
    try {
      await abrirPdf(documento.id);
    } catch (error) {
      avisar(mensajeDeError(error), "error");
    } finally {
      setAbriendo(null);
    }
  }

  // ---------- Renombrar y borrar ----------
  async function renombrar(datos) {
    const actualizada = await apiColecciones.actualizar(id, datos);
    setColeccion(actualizada);
    setEditando(false);
    avisar(`Colección renombrada a «${actualizada.nombre}».`);
  }

  async function confirmarBorrado() {
    setBorrando(true);
    try {
      if (porBorrar.tipo === "coleccion") {
        await apiColecciones.borrar(id);
        avisar(`Colección «${coleccion.nombre}» borrada.`);
        navegar("/colecciones", { replace: true });
        return;
      }
      const { documento } = porBorrar;
      await apiDocumentos.borrar(documento.id);
      olvidarPdf(documento.id);
      setDocumentos((actuales) => actuales.filter((d) => d.id !== documento.id));
      setColeccion((actual) => ({
        ...actual,
        total_documentos: actual.total_documentos - 1,
        total_paginas: actual.total_paginas - documento.num_paginas,
      }));
      avisar(`«${documento.nombre_original}» borrado.`);
      setPorBorrar(null);
    } catch (error) {
      avisar(mensajeDeError(error), "error");
    } finally {
      setBorrando(false);
    }
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
  if (!coleccion) return <p className={estilos.cargando}>Cargando colección…</p>;

  return (
    <>
      <nav className={estilos.migas} aria-label="Ruta">
        <Link to="/colecciones">Colecciones</Link>
        <span aria-hidden="true">/</span>
      </nav>

      <div className={estilos.encabezado}>
        {editando ? (
          <div className={estilos.edicion}>
            <FormularioColeccion inicial={coleccion} onGuardar={renombrar} onCancelar={() => setEditando(false)} />
          </div>
        ) : (
          <>
            <div className={estilos.titulo}>
              <h1>{coleccion.nombre}</h1>
              {coleccion.descripcion && <p className={estilos.descripcion}>{coleccion.descripcion}</p>}
              <p className={`${estilos.resumen} num`}>
                {plural(coleccion.total_documentos, "documento")} · {plural(coleccion.total_paginas, "página")}
              </p>
            </div>
            <div className={estilos.botones}>
              <Link className="boton boton-primario" to={`/colecciones/${id}/chat`}>
                Preguntar
              </Link>
              <button className="boton boton-secundario" type="button" onClick={() => setEditando(true)}>
                Renombrar
              </button>
              <button className="boton boton-peligro" type="button" onClick={() => setPorBorrar({ tipo: "coleccion" })}>
                Borrar colección
              </button>
            </div>
          </>
        )}
      </div>

      <div className={estilos.cuerpo}>
        <ZonaSubida limiteMb={LIMITE_MB} onArchivos={agregarArchivos} />
        <ColaSubidas subidas={subidas} onQuitar={quitarSubida} />

        {documentos.length > 0 ? (
          <TablaDocumentos
            documentos={documentos}
            abriendo={abriendo}
            reintentando={reintentando}
            onAbrir={abrir}
            onReintentar={reintentar}
            onBorrar={(documento) => setPorBorrar({ tipo: "documento", documento })}
          />
        ) : (
          <p className={estilos.sinDocumentos}>Esta colección todavía no tiene documentos.</p>
        )}
      </div>

      <Dialogo
        abierto={Boolean(porBorrar)}
        titulo={
          porBorrar?.tipo === "documento"
            ? `¿Borrar «${porBorrar.documento.nombre_original}»?`
            : `¿Borrar «${coleccion.nombre}»?`
        }
        textoConfirmar={porBorrar?.tipo === "documento" ? "Borrar documento" : "Borrar colección"}
        ocupado={borrando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setPorBorrar(null)}
      >
        <p>
          {porBorrar?.tipo === "coleccion" && coleccion.total_documentos > 0 && (
            <>
              Se borrarán también sus <span className="num">{plural(coleccion.total_documentos, "documento")}</span> (
              <span className="num">{coleccion.total_paginas}</span> páginas).{" "}
            </>
          )}
          Esta acción no se puede deshacer.
        </p>
      </Dialogo>
    </>
  );
}

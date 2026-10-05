/*
  Convierte el texto del modelo en elementos de React:
  - párrafos (separados por línea en blanco)
  - listas (líneas que empiezan con "- ", "* " o "1. "), aunque vayan
    después de una frase introductoria en el mismo bloque
  - **negritas**
  - citas [n] -> botón numerado como nota al pie

  No usamos dangerouslySetInnerHTML: el texto viene de un modelo que leyó
  PDFs de cualquiera, y meterlo como HTML permitiría inyectar código.
  Construyendo elementos, React escapa todo automáticamente.
*/
import estilos from "./TextoRespuesta.module.css";

const PIEZAS = /(\*\*[^*]+\*\*|(?:\[\d+\])+)/g;
const MARCA_LISTA = /^\s*(?:[-*•]|\d+[.)])\s+/;

/*
  El modelo cita números de fragmento ([4], [7]...). Para la persona es más
  claro numerar como notas al pie: 1, 2, 3 en orden de aparición, y una
  sola nota por cada documento + página aunque vengan de fragmentos distintos.
*/
export function numerarCitas(texto, fuentes) {
  const porNumero = new Map(fuentes.map((fuente) => [fuente.numero, fuente]));
  const notas = new Map(); // "documento-pagina" -> { indice, fuente }
  const indicePorNumero = new Map(); // número del modelo -> número visible
  for (const coincidencia of texto.matchAll(/\[(\d+)\]/g)) {
    const fuente = porNumero.get(Number(coincidencia[1]));
    if (!fuente) continue;
    const clave = `${fuente.documento_id}-${fuente.pagina}`;
    if (!notas.has(clave)) notas.set(clave, { indice: notas.size + 1, fuente });
    indicePorNumero.set(fuente.numero, notas.get(clave).indice);
  }
  return { indicePorNumero, notas: [...notas.values()] };
}

function enLinea(texto, contexto, clave) {
  const { porNumero, indicePorNumero, onCitar } = contexto;
  return texto.split(PIEZAS).map((pieza, i) => {
    const k = `${clave}-${i}`;
    if (pieza.startsWith("**") && pieza.endsWith("**") && pieza.length > 4) {
      return <strong key={k}>{pieza.slice(2, -2)}</strong>;
    }
    if (/^(\[\d+\])+$/.test(pieza)) {
      // [2][5] -> notas visibles sin repetir (dos fragmentos de la misma página = una nota)
      const vistas = new Map();
      for (const [, numero] of pieza.matchAll(/\[(\d+)\]/g)) {
        const indice = indicePorNumero.get(Number(numero));
        if (indice && !vistas.has(indice)) vistas.set(indice, porNumero.get(Number(numero)));
      }
      return [...vistas].map(([indice, fuente]) => (
        <button
          key={`${k}-${indice}`}
          type="button"
          className={estilos.marca}
          onClick={() => onCitar(fuente)}
          title={`${fuente.documento} · p. ${fuente.pagina}`}
          aria-label={`Fuente ${indice}: ${fuente.documento}, página ${fuente.pagina}`}
        >
          {indice}
        </button>
      ));
    }
    return pieza;
  });
}

// Un bloque puede mezclar frases y viñetas: los separamos en párrafos y listas
function segmentar(bloque) {
  const segmentos = [];
  for (const linea of bloque.split("\n").filter((l) => l.trim())) {
    const esElemento = MARCA_LISTA.test(linea);
    const ultimo = segmentos.at(-1);
    if (esElemento) {
      const ordenada = /^\s*\d/.test(linea);
      if (ultimo?.tipo === "lista") ultimo.lineas.push(linea.replace(MARCA_LISTA, ""));
      else segmentos.push({ tipo: "lista", ordenada, lineas: [linea.replace(MARCA_LISTA, "")] });
    } else if (ultimo?.tipo === "parrafo") {
      ultimo.lineas.push(linea.trim());
    } else {
      segmentos.push({ tipo: "parrafo", lineas: [linea.trim()] });
    }
  }
  return segmentos;
}

export default function TextoRespuesta({ texto, fuentes, indicePorNumero, onCitar, escribiendo }) {
  const contexto = { porNumero: new Map(fuentes.map((f) => [f.numero, f])), indicePorNumero, onCitar };
  const segmentos = texto.split(/\n{2,}/).flatMap(segmentar);
  const cursor = escribiendo && <span className={estilos.cursor} aria-hidden="true" />;

  return (
    <div className={estilos.texto}>
      {segmentos.map((segmento, indice) => {
        const esUltimo = indice === segmentos.length - 1;
        if (segmento.tipo === "lista") {
          const Lista = segmento.ordenada ? "ol" : "ul";
          return (
            <Lista key={indice}>
              {segmento.lineas.map((linea, j) => (
                <li key={j}>
                  {enLinea(linea, contexto, `${indice}-${j}`)}
                  {esUltimo && j === segmento.lineas.length - 1 && cursor}
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={indice}>
            {enLinea(segmento.lineas.join(" "), contexto, indice)}
            {esUltimo && cursor}
          </p>
        );
      })}
      {!segmentos.length && cursor}
    </div>
  );
}

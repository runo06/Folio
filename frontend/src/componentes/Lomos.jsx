import estilos from "./Lomos.module.css";

const MAXIMO_LOMOS = 24;

/*
  Dibuja cada PDF como el lomo de un libro. El grosor crece con el número
  de páginas (en escala logarítmica, para que un libro de 500 páginas no
  aplaste a un artículo de 10). La altura varía un poco para que parezca
  un estante real; usamos el índice, no azar, para que no cambie en cada
  renderizado.
*/
export default function Lomos({ paginas }) {
  if (!paginas.length) return <div className={estilos.vacio} aria-hidden="true" />;

  return (
    <div className={estilos.estante} aria-hidden="true">
      {paginas.slice(0, MAXIMO_LOMOS).map((cantidad, indice) => {
        const grosor = Math.min(11, Math.max(3, Math.round(Math.log2(cantidad + 1) * 1.3)));
        const altura = 70 + ((indice * 37) % 31);
        return <i key={indice} style={{ width: grosor, height: `${altura}%` }} />;
      })}
    </div>
  );
}

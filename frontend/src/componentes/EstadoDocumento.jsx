import estilos from "./EstadoDocumento.module.css";

const TEXTOS = {
  pendiente: "Pendiente",
  procesando: "Procesando",
  listo: "Listo",
  error: "Error",
};

export default function EstadoDocumento({ estado }) {
  return <span className={`${estilos.estado} ${estilos[estado] ?? ""}`}>{TEXTOS[estado] ?? estado}</span>;
}

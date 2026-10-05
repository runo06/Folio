import { Link } from "react-router";
import estilos from "./Marca.module.css";

// El logotipo: una hoja con la esquina doblada, más el nombre
export default function Marca({ destino = "/colecciones" }) {
  return (
    <Link to={destino} className={estilos.marca} aria-label="Folio, ir al inicio">
      <span className={estilos.hoja} aria-hidden="true" />
      <span className={estilos.nombre}>Folio</span>
    </Link>
  );
}

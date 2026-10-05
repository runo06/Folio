import { useEffect, useState } from "react";

/*
  Hook que responde true/false a una "media query" de CSS y se actualiza
  si cambia (al girar el celular o cambiar el tamaño de la ventana).
  Ejemplo: const esAngosta = useConsultaMedia("(max-width: 899px)");
*/
export default function useConsultaMedia(consulta) {
  const [coincide, setCoincide] = useState(() => window.matchMedia(consulta).matches);

  useEffect(() => {
    const lista = window.matchMedia(consulta);
    const alCambiar = () => setCoincide(lista.matches);
    alCambiar();
    lista.addEventListener("change", alCambiar);
    return () => lista.removeEventListener("change", alCambiar);
  }, [consulta]);

  return coincide;
}

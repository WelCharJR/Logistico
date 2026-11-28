import { useRef, useState } from "react";

// Botão de "segurar para confirmar": a faixa enche enquanto pressiona (2 s, linear) e a ação só
// acontece quando ela completa. Soltar antes desfaz rápido. Funciona com mouse, toque e teclado
// (segurar Enter/Espaço).
export default function HoldButton({ onConfirm, children, className = "", label, ...rest }) {
  const [holding, setHolding] = useState(false);
  const fired = useRef(false);
  const start = (e) => {
    if (e.type === "keydown" && ((e.key !== "Enter" && e.key !== " ") || e.repeat)) return;
    if (e.type === "keydown") e.preventDefault();
    fired.current = false;
    setHolding(true);
  };
  const stop = (e) => {
    if (e?.type === "keyup" && e.key !== "Enter" && e.key !== " ") return;
    setHolding(false);
  };
  return (
    <button
      type="button"
      className={"log-hold " + className + (holding ? " holding" : "")}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={start}
      onKeyUp={stop}
      onBlur={stop}
      onClick={(e) => e.preventDefault()}
      aria-label={label}
      {...rest}
    >
      <span
        className="log-hold-fill"
        aria-hidden="true"
        onTransitionEnd={(e) => {
          if (e.propertyName !== "clip-path" || !holding || fired.current) return;
          fired.current = true;
          setHolding(false);
          onConfirm();
        }}
      />
      <span className="log-hold-label">{children}</span>
    </button>
  );
}

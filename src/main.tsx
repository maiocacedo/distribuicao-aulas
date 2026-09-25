import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/**
 * Uma exceção durante o render derruba a árvore inteira e deixa a janela em
 * branco — o pior modo de falha possível, porque não sobra nem o que relatar.
 * Estas duas redes fazem o erro aparecer na tela.
 */
class Barreira extends React.Component<
  { children: React.ReactNode },
  { erro: Error | null }
> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <main className="falha">
        <h1>Distribuição de Aulas</h1>
        <div className="alerta">
          <strong>A tela quebrou ao ser desenhada</strong>
          <pre>
            {this.state.erro.message}
            {"\n\n"}
            {this.state.erro.stack}
          </pre>
        </div>
        <button onClick={() => location.reload()}>Recarregar</button>
      </main>
    );
  }
}

/** Erros fora do render — promessas soltas, eventos — também precisam aparecer. */
function mostrarFalhaGlobal(o: unknown) {
  const raiz = document.getElementById("root");
  if (!raiz || raiz.dataset.falhou) return;
  raiz.dataset.falhou = "1";
  raiz.innerHTML =
    '<main class="falha"><h1>Distribuição de Aulas</h1>' +
    '<div class="alerta"><strong>Erro fora da tela</strong><pre></pre></div></main>';
  raiz.querySelector("pre")!.textContent =
    o instanceof Error ? `${o.message}\n\n${o.stack}` : String(o);
}

window.addEventListener("error", (e) => mostrarFalhaGlobal(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => mostrarFalhaGlobal(e.reason));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Barreira>
      <App />
    </Barreira>
  </React.StrictMode>,
);

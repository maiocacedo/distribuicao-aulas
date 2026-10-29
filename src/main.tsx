import "./estilos/tema.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Alerta } from "./componentes/alerta";
import { ProvedorDeConfirmacao } from "./componentes/confirmacao";
import { Button } from "./componentes/ui/button";

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
      <main className="p-10">
        <h1 className="mb-3 text-xl font-bold">Distribuição de Aulas</h1>
        <Alerta tom="erro">
          <strong>A tela quebrou ao ser desenhada</strong>
          <pre className="mt-1 whitespace-pre-wrap text-xs">
            {this.state.erro.message}
            {"\n\n"}
            {this.state.erro.stack}
          </pre>
        </Alerta>
        <Button variant="outline" onClick={() => location.reload()}>
          Recarregar
        </Button>
      </main>
    );
  }
}

/** Erros fora do render — promessas soltas, eventos — também precisam aparecer. */
function mostrarFalhaGlobal(o: unknown) {
  const raiz = document.getElementById("root");
  if (!raiz || raiz.dataset.falhou) return;
  raiz.dataset.falhou = "1";
  // Sem React aqui: o HTML vai direto para a página, e o Tailwind enxerga as
  // classes porque estão escritas como texto no código-fonte.
  raiz.innerHTML =
    '<main class="p-10"><h1 class="mb-3 text-xl font-bold">Distribuição de Aulas</h1>' +
    '<div role="alert" class="rounded-md border border-destructive bg-panel px-3 py-2 text-destructive">' +
    '<strong>Erro fora da tela</strong><pre class="mt-1 whitespace-pre-wrap text-xs"></pre></div></main>';
  raiz.querySelector("pre")!.textContent =
    o instanceof Error ? `${o.message}\n\n${o.stack}` : String(o);
}

window.addEventListener("error", (e) => mostrarFalhaGlobal(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => mostrarFalhaGlobal(e.reason));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Barreira>
      <ProvedorDeConfirmacao>
        <App />
      </ProvedorDeConfirmacao>
    </Barreira>
  </React.StrictMode>,
);

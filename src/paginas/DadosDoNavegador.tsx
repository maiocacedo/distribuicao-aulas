import { useEffect, useRef, useState } from "react";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { Secao } from "@/componentes/secao";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { arquivoDoBanco, bancoEmMemoria, type Resumo, type Substituto } from "../db";
import { historico } from "../grade";

const MOTIVO = "motivo-trocar-banco";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const textoDoErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `distribuicao-2026-10-15.db`: a data separa uma cópia da outra na pasta de downloads. */
function nomeDoArquivo(): string {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, "0");
  return `distribuicao-${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}.db`;
}

function baixar(bytes: Uint8Array, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/x-sqlite3" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  // O clique já entregou o arquivo ao navegador; a URL só ocupa memória.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const AVISO_DE_PERDA = "O banco atual deste navegador será apagado. Para não perder o que está aqui, exporte o banco antes.";

/**
 * Só no modo navegador. Diz onde os dados ficam e oferece o que o desktop
 * resolve copiando um arquivo: baixar o banco e trocá-lo (por um arquivo, pelo
 * exemplo, por um banco vazio). Toda troca termina recarregando o app: as
 * telas, o curso escolhido e o histórico de desfazer eram do banco anterior.
 */
export default function DadosDoNavegador() {
  const confirmar = useConfirmar();
  const [emMemoria, setEmMemoria] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const escolha = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bancoEmMemoria().then(setEmMemoria, () => {});
  }, []);

  /** Roda uma operação no banco com os botões parados; devolve se deu certo. */
  async function trabalhar<T>(acao: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false }> {
    setTrabalhando(true);
    try {
      return { ok: true, valor: await acao() };
    } catch (e) {
      avisar.erro(textoDoErro(e));
      return { ok: false };
    } finally {
      setTrabalhando(false);
    }
  }

  async function exportar() {
    const r = await trabalhar(() => arquivoDoBanco.exportar());
    if (r.ok) baixar(r.valor, nomeDoArquivo());
  }

  async function trocar(s: Substituto) {
    const r = await trabalhar(() => arquivoDoBanco.substituir(s));
    if (!r.ok) return;
    // O histórico guarda escritas do banco que acabou de sair. A recarga já o
    // zeraria; limpar antes é o que garante que nada o use no meio do caminho.
    historico.limpar();
    location.reload();
  }

  async function importar(arquivo: File) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // Confere antes de perguntar: um arquivo que não serve é recusado sem
    // pedir confirmação de nada, e a confirmação diz o que vai entrar.
    const conferido = await trabalhar<Resumo>(() => arquivoDoBanco.conferir(bytes));
    if (!conferido.ok) return;
    const { cursos, professores, disciplinas } = conferido.valor;
    const ok = await confirmar({
      titulo: "Substituir o banco deste navegador?",
      descricao:
        `${AVISO_DE_PERDA} Entra no lugar dele o banco de “${arquivo.name}”, com ` +
        `${plural(cursos, "curso", "cursos")}, ${plural(professores, "professor", "professores")} e ` +
        `${plural(disciplinas, "disciplina", "disciplinas")}.`,
      confirmar: "Substituir o banco",
      perigo: true,
    });
    if (ok) await trocar({ por: "arquivo", bytes });
  }

  async function carregarExemplo() {
    const ok = await confirmar({
      titulo: "Carregar os dados de exemplo?",
      descricao: `${AVISO_DE_PERDA} Entra no lugar dele um curso de exemplo, com professores, salas, disciplinas e grade.`,
      confirmar: "Carregar o exemplo",
      perigo: true,
    });
    if (ok) await trocar({ por: "exemplo" });
  }

  async function comecarVazio() {
    const ok = await confirmar({
      titulo: "Começar com um banco vazio?",
      descricao: `${AVISO_DE_PERDA} Fica um banco novo, sem nada cadastrado.`,
      confirmar: "Apagar e começar vazio",
      perigo: true,
    });
    if (ok) await trocar({ por: "vazio" });
  }

  // Em memória, um banco importado ou o exemplo sumiriam na própria recarga
  // que termina a troca. Começar vazio continua valendo: é o que a recarga faz.
  const motivo = trabalhando
    ? "Trabalhando no banco…"
    : emMemoria
      ? "Este navegador não guarda os dados: o banco trocado sumiria na recarga que termina a troca."
      : "";
  const parado = trabalhando || emMemoria;
  const descrito = (desabilitado: boolean) => (desabilitado ? MOTIVO : undefined);

  return (
    <>
      <CabecalhoPagina titulo="Dados do navegador" sub="Onde fica o banco quando o aplicativo roda no navegador, e como guardá-lo ou trocá-lo." />

      <Secao titulo="Onde ficam os dados">
        <div className="flex max-w-[72ch] flex-col gap-2 text-base text-tx2">
          <p>
            O banco fica neste navegador, nesta máquina. Outro navegador, ou outra máquina, começa do zero. Os dados
            somem se os dados do site forem limpos nas configurações do navegador, e numa janela anônima somem ao
            fechar a janela.
          </p>
          <p>
            Para guardar uma cópia, ou levar os dados para o aplicativo instalado, exporte o banco: o arquivo é o mesmo
            que o aplicativo instalado usa.
          </p>
        </div>
      </Secao>

      <Secao titulo="Exportar">
        <p className="mb-3 max-w-[72ch] text-base text-tx2">
          Baixa o banco inteiro num arquivo <span className="font-mono text-[12px]">.db</span>.
        </p>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void exportar()}
            disabled={trabalhando}
            aria-describedby={descrito(trabalhando)}
          >
            Exportar banco
          </Button>
        </div>
      </Secao>

      <Secao titulo="Trocar o banco">
        <p className="mb-3 max-w-[72ch] text-base text-tx2">
          Cada opção apaga o banco atual deste navegador, pede confirmação antes e recarrega o aplicativo no fim.
        </p>
        {motivo && (
          <p id={MOTIVO} className="mb-3 text-xs text-tx2">
            {motivo}
          </p>
        )}
        <div className="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-2">
          <Button
            variant="outline"
            onClick={() => escolha.current?.click()}
            disabled={parado}
            aria-describedby={descrito(parado)}
          >
            Importar banco…
          </Button>
          <span className="text-xs text-tx2">Um arquivo .db exportado daqui ou do aplicativo instalado.</span>
          <Button
            variant="outline"
            onClick={() => void carregarExemplo()}
            disabled={parado}
            aria-describedby={descrito(parado)}
          >
            Carregar dados de exemplo
          </Button>
          <span className="text-xs text-tx2">Um curso completo, com professores, salas e grade, para experimentar.</span>
          <Button
            variant="outline"
            onClick={() => void comecarVazio()}
            disabled={trabalhando}
            aria-describedby={descrito(trabalhando)}
          >
            Começar vazio
          </Button>
          <span className="text-xs text-tx2">Um banco novo, sem nada cadastrado.</span>
        </div>
        <input
          ref={escolha}
          type="file"
          accept=".db,.sqlite,.sqlite3"
          aria-label="Arquivo do banco a importar"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0];
            // Limpa para que escolher o mesmo arquivo de novo também avise.
            e.currentTarget.value = "";
            if (arquivo) void importar(arquivo);
          }}
        />
      </Secao>
    </>
  );
}

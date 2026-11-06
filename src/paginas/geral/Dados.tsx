import { useEffect, useRef, useState } from "react";
import { CabecalhoPagina } from "@/componentes/cabecalho-pagina";
import { useConfirmar } from "@/componentes/confirmacao";
import { Secao } from "@/componentes/secao";
import { avisar } from "@/componentes/toasts";
import { Button } from "@/componentes/ui/button";
import { arquivoDoBanco, bancoEmMemoria, noNavegador, type Resumo, type Substituto } from "../../db";
import { arquivoDoDesktop } from "../../banco/tauri";
import { historico } from "../../grade";

const MOTIVO = "motivo-trocar-banco";

/**
 * O maior arquivo que vale a pena ler. Um banco deste aplicativo tem centenas
 * de kB; acima disto o arquivo não é um banco dele, e lê-lo inteiro na
 * memória só travaria a página.
 */
const LIMITE_DO_ARQUIVO = 200 * 1024 * 1024;

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

/**
 * Geral › Dados. Os dados vivem no banco; esta é a página que os leva para
 * fora (exportar um `.db`) e os traz de volta (importar). O arquivo é o mesmo
 * nos dois modos: o exportado do navegador abre no executável, e o contrário.
 *
 * No navegador, a troca também pode ser pelo exemplo ou por um banco vazio.
 * No executável, importar guarda o banco atual como `distribuicao.db.anterior`
 * e reinicia o app. Toda troca termina recarregando: as telas, o curso
 * escolhido e o histórico de desfazer eram do banco anterior.
 */
export default function Dados() {
  const confirmar = useConfirmar();
  const navegador = noNavegador();
  const [emMemoria, setEmMemoria] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const escolha = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bancoEmMemoria().then(setEmMemoria, () => {});
  }, []);

  const aviso = navegador
    ? "O banco atual deste navegador será apagado. Para não perder o que está aqui, exporte o banco antes."
    : "O banco atual sai do lugar e fica guardado como distribuicao.db.anterior, na pasta do aplicativo.";

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
    if (navegador) {
      const r = await trabalhar(() => arquivoDoBanco.exportar());
      if (r.ok) baixar(r.valor, nomeDoArquivo());
      return;
    }
    const r = await trabalhar(() => arquivoDoDesktop.exportar(nomeDoArquivo()));
    if (r.ok) avisar.sucesso(`Banco exportado para ${r.valor}`);
  }

  /** Põe o novo banco no lugar. Depois de dar certo, os botões ficam parados até a página sair. */
  async function trocar(acao: () => Promise<unknown>) {
    setTrabalhando(true);
    // O histórico guarda escritas do banco que vai sair: nada pode usá-lo no
    // meio do caminho.
    historico.limpar();
    try {
      await acao();
    } catch (e) {
      setTrabalhando(false);
      avisar.erro(textoDoErro(e));
      return;
    }
    // No executável o app reinicia sozinho; no navegador, a recarga abre o novo.
    if (navegador) location.reload();
  }

  const trocarNoNavegador = (s: Substituto) => trocar(() => arquivoDoBanco.substituir(s));

  async function importar(arquivo: File) {
    if (arquivo.size > LIMITE_DO_ARQUIVO)
      return avisar.erro("Arquivo grande demais para ser um banco deste aplicativo.");
    // A leitura pode falhar (o arquivo sumiu ou mudou entre escolher e ler):
    // a falha vira aviso, não erro solto na tela.
    const lido = await trabalhar(async () => new Uint8Array(await arquivo.arrayBuffer()));
    if (!lido.ok) return;
    const bytes = lido.valor;
    // Confere antes de perguntar: um arquivo que não serve é recusado sem
    // pedir confirmação de nada, e a confirmação diz o que vai entrar.
    const conferido = await trabalhar<Resumo>(() =>
      navegador ? arquivoDoBanco.conferir(bytes) : arquivoDoDesktop.conferir(bytes),
    );
    if (!conferido.ok) return;
    const { cursos, professores, disciplinas } = conferido.valor;
    const ok = await confirmar({
      titulo: navegador ? "Substituir o banco deste navegador?" : "Substituir o banco do aplicativo?",
      descricao:
        `${aviso} Entra no lugar dele o banco de “${arquivo.name}”, com ` +
        `${plural(cursos, "curso", "cursos")}, ${plural(professores, "professor", "professores")} e ` +
        `${plural(disciplinas, "disciplina", "disciplinas")}.` +
        (navegador ? "" : " O aplicativo reinicia no fim."),
      confirmar: "Substituir o banco",
      perigo: true,
    });
    if (!ok) return;
    if (navegador) await trocarNoNavegador({ por: "arquivo", bytes });
    else await trocar(() => arquivoDoDesktop.aplicar());
  }

  async function carregarExemplo() {
    const ok = await confirmar({
      titulo: "Carregar os dados de exemplo?",
      descricao: `${aviso} Entra no lugar dele um curso de exemplo, com professores, salas, disciplinas e grade.`,
      confirmar: "Carregar o exemplo",
      perigo: true,
    });
    if (ok) await trocarNoNavegador({ por: "exemplo" });
  }

  async function comecarVazio() {
    const ok = await confirmar({
      titulo: "Começar com um banco vazio?",
      descricao: `${aviso} Fica um banco novo, sem nada cadastrado.`,
      confirmar: "Apagar e começar vazio",
      perigo: true,
    });
    if (ok) await trocarNoNavegador({ por: "vazio" });
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
      <CabecalhoPagina titulo="Dados" sub="Onde fica o banco, e como exportá-lo, importá-lo ou trocá-lo." />

      <Secao titulo="Onde ficam os dados">
        <div className="flex max-w-[72ch] flex-col gap-2 text-base text-tx2">
          {navegador ? (
            <>
              <p>
                O banco fica neste navegador, nesta máquina. Outro navegador, ou outra máquina, começa do zero. Os
                dados somem se os dados do site forem limpos nas configurações do navegador, e numa janela anônima
                somem ao fechar a janela.
              </p>
              <p>
                Para guardar uma cópia, levar os dados para outra máquina ou para o aplicativo instalado, exporte o
                banco e importe o arquivo do outro lado.
              </p>
            </>
          ) : (
            <>
              <p>
                O banco é o arquivo{" "}
                <span className="font-mono text-[12px]">%APPDATA%\br.edu.utfpr.distribuicaoaulas\distribuicao.db</span>,
                nesta máquina.
              </p>
              <p>
                Para levar os dados para a versão no navegador ou para outra máquina, exporte o banco e importe o
                arquivo do outro lado.
              </p>
            </>
          )}
          <p>Tema e acessibilidade não vão no arquivo: são deste aparelho e ficam como estão.</p>
        </div>
      </Secao>

      <Secao titulo="Exportar">
        <p className="mb-3 max-w-[72ch] text-base text-tx2">
          {navegador ? "Baixa" : "Grava na pasta Downloads"} o banco inteiro num arquivo{" "}
          <span className="font-mono text-[12px]">.db</span>: cursos, professores, salas, disciplinas, regras e grades.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={() => void exportar()} disabled={trabalhando} aria-describedby={descrito(trabalhando)}>
            Exportar banco
          </Button>
        </div>
      </Secao>

      <Secao titulo={navegador ? "Trocar o banco" : "Importar"}>
        <p className="mb-3 max-w-[72ch] text-base text-tx2">
          {navegador
            ? "Cada opção apaga o banco atual deste navegador, pede confirmação antes e recarrega o aplicativo no fim."
            : "Põe um arquivo .db no lugar do banco atual, que fica guardado como distribuicao.db.anterior. Pede confirmação antes e reinicia o aplicativo no fim."}
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
          <span className="text-xs text-tx2">
            {navegador
              ? "Um arquivo .db exportado daqui ou do aplicativo instalado."
              : "Um arquivo .db exportado daqui ou da versão no navegador."}
          </span>
          {navegador && (
            <>
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
            </>
          )}
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
            // Nada aqui pode virar promessa rejeitada solta: a rede global de
            // erro trocaria a tela inteira por uma falha.
            if (arquivo) importar(arquivo).catch((erro) => avisar.erro(textoDoErro(erro)));
          }}
        />
      </Secao>
    </>
  );
}

import { Info, Mail } from "lucide-react";
import { LogoUtfpr } from "@/componentes/logo-utfpr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/componentes/ui/dialog";
import { cn } from "@/lib/utils";
import { noNavegador } from "../db";

/**
 * Contato de quem mantém a ferramenta. Genérico por enquanto: troque aqui
 * pelos dados reais (nome, setor, e-mail).
 */
const CONTATO = {
  responsavel: "Coordenação do curso",
  setor: "UTFPR — Câmpus (a definir)",
  email: "contato@exemplo.edu.br",
};

const REPOSITORIO = "https://github.com/maiocacedo/distribuicao-aulas";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-tx3">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** O item "Sobre" da barra lateral e a janela que ele abre. */
export function Sobre({ className }: { className?: string }) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-tx2 hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Info className="size-3.5 shrink-0" aria-hidden />
        Sobre
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Distribuição de Aulas</DialogTitle>
          <DialogDescription>
            Montagem da grade horária de cursos: cadastro de professores, disciplinas e salas, grade manual e geração
            automática de um horário sem conflitos.
          </DialogDescription>
        </DialogHeader>

        <LogoUtfpr className="w-40" />

        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Linha rotulo="Versão">
            {__VERSAO__} · {noNavegador() ? "no navegador" : "aplicativo instalado"}
          </Linha>
          <Linha rotulo="Responsável">{CONTATO.responsavel}</Linha>
          <Linha rotulo="Setor">{CONTATO.setor}</Linha>
          <Linha rotulo="Contato">
            <a
              href={`mailto:${CONTATO.email}`}
              className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
            >
              <Mail className="size-3.5" aria-hidden />
              {CONTATO.email}
            </a>
          </Linha>
          <Linha rotulo="Código-fonte">
            <a href={REPOSITORIO} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              github.com/maiocacedo/distribuicao-aulas
            </a>
          </Linha>
          <Linha rotulo="Licença">MIT</Linha>
        </dl>

        <p className="text-xs text-tx3">
          Para relatar um problema ou sugerir uma melhoria, escreva para o contato acima dizendo o que fazia, o que
          esperava e o que aconteceu. Logo da UTFPR: Universidade Tecnológica Federal do Paraná, via Wikimedia Commons,
          CC BY 4.0.
        </p>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

import type { Motivo, Turno } from "./tipos";

/** "Marina Sousa" → "M. Sousa": a célula é estreita e o sobrenome basta. */
export function curto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return nome;
  return `${partes[0][0]}. ${partes[partes.length - 1]}`;
}

/** Como chamar cada id na tela. As regras guardam ids; nomes são da interface. */
export interface Nomes {
  cursoAtual: number;
  professor(id: number): string;
  curso(id: number): string;
  sala(id: number): string;
}

const TURNO: Record<Turno, string> = { manha: "manhã", tarde: "tarde" };

/** O motivo como texto curto, para caber na célula da grade. */
export function descrever(m: Motivo, n: Nomes): string {
  switch (m.regra) {
    case "faixa":
      return "Horário fora da grade";
    case "D16":
      return "Disciplina não ofertada";
    case "D1":
      return "Já há aula neste horário";
    case "D5":
      return "Sábado desmarcado no cadastro";
    case "D5-turno":
      return `Sábado só tem aula de ${m.turnosSabado.map((t) => TURNO[t]).join(" e ")}`;
    case "D13":
      return "Fora dos turnos do curso";
    case "D14":
      return `Disciplina só ${m.turno === "manha" ? "de manhã" : "à tarde"}`;
    case "D4":
      return `${curto(n.professor(m.professorId))} indisponível`;
    case "D2": {
      const quem = curto(n.professor(m.aula.professorId));
      return m.aula.cursoId === n.cursoAtual
        ? `${quem} no ${m.aula.periodo}º período`
        : `${quem} em ${n.curso(m.aula.cursoId)} (${m.aula.periodo}º)`;
    }
    case "D15":
      return `${curto(n.professor(m.professorId))} no máx. de ${m.limite} dia(s)`;
    case "D3": {
      const sala = n.sala(m.aula.salaId!);
      return m.aula.cursoId === n.cursoAtual
        ? `Sala ${sala} ocupada (${m.aula.periodo}º per.)`
        : `Sala ${sala} ocupada (${n.curso(m.aula.cursoId)}, ${m.aula.periodo}º)`;
    }
    case "D3-sem-sala":
      return "Nenhuma sala aceitável livre";
    case "sala-invalida":
      return m.salaId == null ? "Aula sem sala" : `Sala ${n.sala(m.salaId)} fora do requisito`;
  }
}

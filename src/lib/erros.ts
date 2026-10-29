/**
 * Traduz erro do SQLite para algo que o usuário entenda. A violação de chave
 * estrangeira é a comum: apagar um professor que ainda dá aula, por exemplo.
 */
export function mensagemErro(e: unknown, contexto: string): string {
  const texto = String(e);
  if (/FOREIGN KEY constraint failed/i.test(texto)) {
    return `${contexto} está em uso e não pode ser removido. Remova antes os registros que dependem dele.`;
  }
  if (/UNIQUE constraint failed/i.test(texto)) {
    return "Já existe um registro com esse nome.";
  }
  if (/CHECK constraint failed/i.test(texto)) {
    return "Algum valor está fora do permitido pelo esquema.";
  }
  return texto;
}

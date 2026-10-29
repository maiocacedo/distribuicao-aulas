import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const WINDOWS = process.platform === "win32";
const APP = join(RAIZ, "src-tauri", "target", "debug", WINDOWS ? "distribuicao-aulas.exe" : "distribuicao-aulas");
const EDGE = process.env.MSEDGEDRIVER ?? join(RAIZ, "msedgedriver.exe");
/** É aqui que o app de debug lê `DISTRIBUICAO_BANCO`: binário mais velho que este arquivo pode não o ler. */
const FONTE_DO_BANCO = join(RAIZ, "src-tauri", "src", "lib.rs");

let driver: ChildProcess | undefined;
let pasta = "";

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./*.spec.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [{ maxInstances: 1, "tauri:options": { application: APP } } as WebdriverIO.Capabilities],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  mochaOpts: { ui: "bdd", timeout: 120_000, bail: true },

  onPrepare() {
    if (!existsSync(APP)) throw new Error(`Binário não encontrado: ${APP}\nRode: npm run tauri build -- --debug --no-bundle`);
    // Antes de abrir o app, e não depois: um binário de antes do suporte a
    // `DISTRIBUICAO_BANCO` abriria o banco REAL do usuário, e a checagem do
    // `before` do spec só roda com ele já aberto.
    if (statSync(APP).mtimeMs < statSync(FONTE_DO_BANCO).mtimeMs)
      throw new Error(
        `Binário mais antigo que ${FONTE_DO_BANCO}: ${APP}\n` +
          "Ele pode não usar o banco temporário do smoke e abrir o banco real.\n" +
          "Recompile com: npm run tauri build -- --debug --no-bundle",
      );
    if (WINDOWS && !existsSync(EDGE)) throw new Error(`msedgedriver não encontrado: ${EDGE}\nRode msedgedriver-tool na raiz.`);
  },

  // Banco isolado por sessão: o app de debug lê DISTRIBUICAO_BANCO, e o
  // tauri-driver repassa o ambiente ao app que abre.
  beforeSession() {
    pasta = mkdtempSync(join(tmpdir(), "distribuicao-smoke-"));
    const banco = join(pasta, "smoke.db");
    // O spec roda neste mesmo processo e confere que o app criou este arquivo.
    process.env.SMOKE_BANCO = banco;
    driver = spawn(join(homedir(), ".cargo", "bin", "tauri-driver"), WINDOWS ? ["--native-driver", EDGE] : [], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, DISTRIBUICAO_BANCO: banco },
    });
  },

  afterSession() {
    driver?.kill();
    try {
      rmSync(pasta, { recursive: true, force: true });
    } catch {
      // No Windows o arquivo pode seguir preso por instantes; a pasta é temporária.
    }
  },
};

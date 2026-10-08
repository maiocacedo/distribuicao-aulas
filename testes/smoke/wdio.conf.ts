import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const WINDOWS = process.platform === "win32";
const APP = join(RAIZ, "src-tauri", "target", "debug", WINDOWS ? "distribuicao-aulas.exe" : "distribuicao-aulas");
const EDGE = process.env.MSEDGEDRIVER ?? join(RAIZ, "msedgedriver.exe");

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
    if (WINDOWS && !existsSync(EDGE)) throw new Error(`msedgedriver não encontrado: ${EDGE}\nRode msedgedriver-tool na raiz.`);
  },

  // Banco isolado por sessão: o app de debug lê DISTRIBUICAO_BANCO, e o
  // tauri-driver repassa o ambiente ao app que abre.
  beforeSession() {
    pasta = mkdtempSync(join(tmpdir(), "distribuicao-smoke-"));
    driver = spawn(join(homedir(), ".cargo", "bin", "tauri-driver"), WINDOWS ? ["--native-driver", EDGE] : [], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, DISTRIBUICAO_BANCO: join(pasta, "smoke.db") },
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

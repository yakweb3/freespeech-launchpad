import { readFileSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = process.cwd();
const manifest = JSON.parse(readFileSync(".openai/hosting.json", "utf8"));
let input = "";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write(
  "Ready for private Site credential JSON on stdin (input is hidden).\n",
);
const credential = await new Promise((resolveInput, reject) => {
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    input += chunk.toString();
    if (input.length > 100000) {
      reject(new Error("Input too large"));
      return;
    }
    const end = input.search(/[\r\n]/);
    if (end >= 0) {
      process.stdin.pause();
      try {
        resolveInput(JSON.parse(input.slice(0, end).replace(/\r$/, "")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    }
  });
});
if (process.stdin.isTTY) process.stdin.setRawMode(false);
input = "";
if (
  credential.auth_mode !== "http_extra_header" ||
  !credential.remote_url?.startsWith("https://") ||
  !credential.remote_url.includes(manifest.project_id) ||
  !credential.token
)
  throw new Error("Credential does not match this Site.");
const secret = credential.token;
const environment = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_TRACE: "0",
  GIT_CURL_VERBOSE: "0",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "http." + credential.remote_url + ".extraheader",
  GIT_CONFIG_VALUE_0: "Authorization: Bearer " + secret,
  GIT_CONFIG_KEY_1: "http.followRedirects",
  GIT_CONFIG_VALUE_1: "false",
};
function run(command, args, { allowFailure = false, auth = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: auth ? environment : { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 12 * 1024 * 1024,
  });
  const output = ((result.stdout || "") + (result.stderr || "")).replaceAll(
    secret,
    "[redacted]",
  );
  if (result.status !== 0 && !allowFailure)
    throw new Error(command + " failed: " + output);
  return { status: result.status, output, stdout: result.stdout || "" };
}
run("git", ["check-ref-format", "refs/heads/" + credential.branch]);
if (!existsSync(".git")) run("git", ["init", "-b", "codex/modern-orange"]);
const remote = run("git", ["remote", "get-url", "sites"], {
  allowFailure: true,
});
if (remote.status === 0 && remote.stdout.trim() !== credential.remote_url)
  throw new Error("Site remote differs from the supplied credential.");
if (remote.status !== 0)
  run("git", ["remote", "add", "sites", credential.remote_url]);
run("git", ["config", "core.autocrlf", "false"]);
if (run("git", ["config", "user.name"], { allowFailure: true }).status !== 0)
  run("git", ["config", "user.name", "Codex"]);
if (run("git", ["config", "user.email"], { allowFailure: true }).status !== 0)
  run("git", ["config", "user.email", "codex@openai.com"]);
const remoteHead = run(
  "git",
  ["ls-remote", "--heads", "sites", "refs/heads/" + credential.branch],
  { auth: true },
).stdout.trim();
if (remoteHead) {
  run("git", ["fetch", "--no-tags", "sites", credential.branch], {
    auth: true,
  });
  if (
    run("git", ["rev-parse", "--verify", "HEAD"], { allowFailure: true })
      .status !== 0
  )
    run("git", ["reset", "--mixed", "FETCH_HEAD"]);
  else if (
    run("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"], {
      allowFailure: true,
    }).status !== 0
  )
    throw new Error("Remote history changed; merge before publishing.");
}
run("git", ["add", "--all"]);
const tracked = run("git", ["ls-files"]).stdout.split("\n");
if (
  tracked.some(
    (p) =>
      /(^|\/)\.env(?!\.example$)/.test(p) ||
      p.startsWith(".sites-runtime/") ||
      p.startsWith(".wrangler/") ||
      p.startsWith("node_modules/"),
  )
)
  throw new Error("Private runtime files are staged. Publication stopped.");
if (
  run("git", ["diff", "--cached", "--quiet"], { allowFailure: true }).status !==
  0
)
  run("git", ["commit", "-m", "Build Modern Orange forum MVP"]);
const sha = run("git", ["rev-parse", "HEAD"]).stdout.trim();
process.stdout.write("Source committed. Building that exact source state.\n");
const build = run(process.execPath, ["scripts/run-framework.mjs", "build"]);
process.stdout.write(build.output.replaceAll(secret, "[redacted]"));
run("git", ["diff", "--quiet", "HEAD"]);
mkdirSync(".sites-runtime", { recursive: true });
const archive = resolve(".sites-runtime/forum-deployment.tar.gz");
const stage = resolve(".sites-runtime/package-" + sha);
mkdirSync(stage, { recursive: true });
cpSync("dist", resolve(stage, "dist"), { recursive: true });
cpSync("dist/.openai", resolve(stage, ".openai"), { recursive: true });
run("tar", ["-czf", archive, "-C", stage, "."]);
const files = run("tar", ["-tzf", archive]).stdout;
if (
  !files.includes("./.openai/hosting.json") ||
  !files.includes("./dist/server/index.js") ||
  !files.includes("./dist/client/")
)
  throw new Error("The deployment archive is incomplete.");
run("git", ["push", "sites", "HEAD:refs/heads/" + credential.branch], {
  auth: true,
});
const remoteSha = run(
  "git",
  ["ls-remote", "--heads", "sites", "refs/heads/" + credential.branch],
  { auth: true },
).stdout.split(/\s/)[0];
if (remoteSha !== sha) throw new Error("Remote source verification failed.");
credential.token = "";
environment.GIT_CONFIG_VALUE_0 = "";
process.stdout.write(
  JSON.stringify({ commit_sha: sha, archive, source_verified: true }) + "\n",
);

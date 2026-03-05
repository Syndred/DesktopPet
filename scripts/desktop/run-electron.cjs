const { spawn } = require("node:child_process");

const electronPath = require("electron");
const args = process.argv.slice(2);

if (!args.length) {
  console.error("Missing Electron app path argument.");
  process.exit(1);
}

const env = { ...process.env };
if (Object.prototype.hasOwnProperty.call(env, "ELECTRON_RUN_AS_NODE")) {
  delete env.ELECTRON_RUN_AS_NODE;
}

const child = spawn(electronPath, args, {
  stdio: "inherit",
  windowsHide: false,
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});


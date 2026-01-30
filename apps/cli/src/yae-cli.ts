#!/usr/bin/env bun
import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as readline from "readline";

// Config types and paths
interface Config {
  baseUrl: string;
  adminToken?: string;
  userToken?: string;
}

const CONFIG_DIR = join(homedir(), ".yae");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const DEFAULT_BASE_URL = "http://localhost:3000";

// ANSI colors
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// Config helpers
function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Ignore parse errors, use defaults
  }
  return { baseUrl: DEFAULT_BASE_URL };
}

function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// HTTP helper
async function request(
  method: string,
  path: string,
  opts: {
    baseUrl: string;
    body?: unknown;
    adminToken?: string;
    userToken?: string;
  },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${opts.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (opts.adminToken) headers["Authorization"] = `Bearer ${opts.adminToken}`;
  else if (opts.userToken)
    headers["Authorization"] = `Bearer ${opts.userToken}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let data: unknown;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

// Output helpers
function success(msg: string) {
  console.log(`${c.green}✓${c.reset} ${msg}`);
}
function error(msg: string) {
  console.error(`${c.red}✗${c.reset} ${msg}`);
}
function info(msg: string) {
  console.log(`${c.cyan}→${c.reset} ${msg}`);
}
function json(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

// Parse args
function parseArgs(args: string[]): {
  command: string[];
  flags: Record<string, string | boolean>;
} {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--json") {
      flags.json = true;
    } else if (arg === "-b" || arg === "--base-url") {
      flags.baseUrl = args[++i] ?? "";
    } else if (arg === "-a" || arg === "--admin") {
      flags.admin = args[++i] ?? "";
    } else if (arg === "-u" || arg === "--user") {
      flags.user = args[++i] ?? "";
    } else if (arg === "--role") {
      flags.role = args[++i] ?? "";
    } else if (!arg.startsWith("-")) {
      command.push(arg);
    }
  }

  return { command, flags };
}

// Command handlers
async function cmdHealth(baseUrl: string, jsonOut: boolean) {
  const res = await request("GET", "/health", { baseUrl });
  if (jsonOut) return json(res.data);
  if (res.ok) success(`Server healthy: ${JSON.stringify(res.data)}`);
  else error(`Health check failed (${res.status})`);
}

async function cmdVerify(token: string, baseUrl: string, jsonOut: boolean) {
  const res = await request("POST", "/verify", { baseUrl, body: { token } });
  if (jsonOut) return json(res.data);
  const valid = (res.data as { valid?: boolean })?.valid;
  if (valid) success("Token is valid");
  else error("Token is invalid");
}

async function cmdUsersList(
  baseUrl: string,
  adminToken: string | undefined,
  jsonOut: boolean,
) {
  if (!adminToken)
    return error(
      "Admin token required. Use --admin or set via 'config set-admin'",
    );
  const res = await request("GET", "/admin/users", { baseUrl, adminToken });
  if (jsonOut) return json(res.data);
  if (!res.ok)
    return error(
      `Failed to list users (${res.status}): ${JSON.stringify(res.data)}`,
    );
  const users = (res.data as { users?: unknown[] })?.users || [];
  if (users.length === 0) {
    info("No users found");
  } else {
    console.log(`${c.cyan}Users:${c.reset}`);
    for (const u of users) {
      const user = u as {
        id?: string;
        name?: string;
        role?: string;
        token?: string;
      };
      console.log(
        `  ${c.dim}id:${c.reset} ${user.id}  ${c.dim}name:${c.reset} ${user.name}  ${c.dim}role:${c.reset} ${user.role || "user"}`,
      );
    }
  }
}

async function cmdUsersCreate(
  name: string,
  role: string | undefined,
  baseUrl: string,
  adminToken: string | undefined,
  jsonOut: boolean,
) {
  if (!adminToken)
    return error(
      "Admin token required. Use --admin or set via 'config set-admin'",
    );
  const body: { name: string; role?: string } = { name };
  if (role) body.role = role;
  const res = await request("POST", "/admin/users", {
    baseUrl,
    adminToken,
    body,
  });
  if (jsonOut) return json(res.data);
  if (!res.ok)
    return error(
      `Failed to create user (${res.status}): ${JSON.stringify(res.data)}`,
    );
  const user = (
    res.data as { user?: { id?: string; name?: string; token?: string } }
  )?.user;
  success(`Created user: ${user?.name} (id: ${user?.id})`);
  if (user?.token) {
    console.log(`  ${c.yellow}Token:${c.reset} ${user.token}`);
    console.log(
      `  ${c.dim}Save with: bun run cli config set-user ${user.token}${c.reset}`,
    );
  }
}

async function cmdUsersDelete(
  id: string,
  baseUrl: string,
  adminToken: string | undefined,
  jsonOut: boolean,
) {
  if (!adminToken)
    return error(
      "Admin token required. Use --admin or set via 'config set-admin'",
    );
  const res = await request("DELETE", `/admin/users/${id}`, {
    baseUrl,
    adminToken,
  });
  if (jsonOut) return json(res.data);
  if (!res.ok)
    return error(
      `Failed to delete user (${res.status}): ${JSON.stringify(res.data)}`,
    );
  success(`Deleted user ${id}`);
}

async function streamChat(
  baseUrl: string,
  userToken: string,
  message: string,
  jsonOut: boolean,
): Promise<void> {
  const url = `${baseUrl}/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const text = await res.text();
    error(`Chat failed (${res.status}): ${text}`);
    return;
  }

  if (!res.body) {
    error("No response body");
    return;
  }

  process.stdout.write(`${c.cyan}yae>${c.reset} `);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events (data: ...\n\n)
    const lines = buffer.split("\n");
    buffer = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // If this is the last line and doesn't end with newline, keep in buffer
      if (i === lines.length - 1 && line !== "") {
        buffer = line;
        break;
      }

      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
          if (jsonOut) {
            console.log(JSON.stringify(chunk));
          } else if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
            process.stdout.write(chunk.delta);
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }

  if (!jsonOut) {
    console.log(); // newline after response
  }
}

async function cmdChat(
  baseUrl: string,
  userToken: string | undefined,
  jsonOut: boolean,
) {
  if (!userToken)
    return error(
      "User token required. Use --user or set via 'config set-user'",
    );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${c.green}you>${c.reset} `, async (input: string) => {
      const message = input.trim();

      if (!message) {
        prompt();
        return;
      }

      if (message === "exit" || message === "quit" || message === "/q") {
        console.log(`${c.dim}Goodbye!${c.reset}`);
        rl.close();
        return;
      }

      try {
        await streamChat(baseUrl, userToken, message, jsonOut);
      } catch (err) {
        error(
          `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      console.log();
      prompt();
    });
  };

  console.log(
    `${c.dim}Chat with Y.A.E. (type 'exit' or '/q' to quit)${c.reset}`,
  );
  console.log();
  prompt();
}

function cmdConfigSetAdmin(token: string) {
  const config = loadConfig();
  config.adminToken = token;
  saveConfig(config);
  success("Admin token saved");
}

function cmdConfigSetUser(token: string) {
  const config = loadConfig();
  config.userToken = token;
  saveConfig(config);
  success("User token saved");
}

function cmdConfigShow() {
  const config = loadConfig();
  console.log(`${c.cyan}Config:${c.reset} ${CONFIG_PATH}`);
  console.log(`  ${c.dim}baseUrl:${c.reset}    ${config.baseUrl}`);
  console.log(
    `  ${c.dim}adminToken:${c.reset} ${config.adminToken ? config.adminToken.slice(0, 20) + "..." : "(not set)"}`,
  );
  console.log(
    `  ${c.dim}userToken:${c.reset}  ${config.userToken ? config.userToken.slice(0, 20) + "..." : "(not set)"}`,
  );
}

function printHelp() {
  console.log(`
${c.cyan}yae-cli${c.reset} - CLI for testing Y.A.E. REST endpoints

${c.yellow}Commands:${c.reset}
  health                        Check server health
  verify <token>                Verify a token
  users list                    List all users (admin)
  users create <name> [--role]  Create a user (admin)
  users delete <id>             Delete a user (admin)
  chat                          Start interactive chat (user)
  config set-admin <token>      Save admin token
  config set-user <token>       Save user token
  config show                   Show current config

${c.yellow}Flags:${c.reset}
  -b, --base-url <url>  Override server URL
  -a, --admin <token>   One-time admin token
  -u, --user <token>    One-time user token
  --json                Raw JSON output
`);
}

// Main
async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command.length === 0) return printHelp();

  const config = loadConfig();
  const baseUrl = (flags.baseUrl as string) || config.baseUrl;
  const adminToken = (flags.admin as string) || config.adminToken;
  const userToken = (flags.user as string) || config.userToken;
  const jsonOut = flags.json === true;

  const [cmd, sub, ...rest] = command;

  try {
    switch (cmd) {
      case "health":
        await cmdHealth(baseUrl, jsonOut);
        break;

      case "verify":
        if (!sub) return error("Usage: verify <token>");
        await cmdVerify(sub, baseUrl, jsonOut);
        break;

      case "users":
        switch (sub) {
          case "list":
            await cmdUsersList(baseUrl, adminToken, jsonOut);
            break;
          case "create":
            if (!rest[0])
              return error("Usage: users create <name> [--role <role>]");
            await cmdUsersCreate(
              rest[0],
              flags.role as string,
              baseUrl,
              adminToken,
              jsonOut,
            );
            break;
          case "delete":
            if (!rest[0]) return error("Usage: users delete <id>");
            await cmdUsersDelete(rest[0], baseUrl, adminToken, jsonOut);
            break;
          default:
            error(`Unknown users command: ${sub}`);
            printHelp();
        }
        break;

      case "chat":
        await cmdChat(baseUrl, userToken, jsonOut);
        break;

      case "config":
        switch (sub) {
          case "set-admin":
            if (!rest[0]) return error("Usage: config set-admin <token>");
            cmdConfigSetAdmin(rest[0]);
            break;
          case "set-user":
            if (!rest[0]) return error("Usage: config set-user <token>");
            cmdConfigSetUser(rest[0]);
            break;
          case "show":
            cmdConfigShow();
            break;
          default:
            error(`Unknown config command: ${sub}`);
            printHelp();
        }
        break;

      default:
        error(`Unknown command: ${cmd}`);
        printHelp();
    }
  } catch (err) {
    error(
      `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();

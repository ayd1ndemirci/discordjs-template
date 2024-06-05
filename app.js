import {
  ChatInputCommandInteraction,
  Client,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  Guild,
  SlashCommandBuilder,
} from "discord.js";

import {
  ApplicationCommandOptionType,
  GatewayIntentBits,
} from "discord-api-types/v10";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join, parse as parsePath } from "path";
import { pathToFileURL } from "url";
import ts from "typescript";

const expect = (...functions) => {
  functions.forEach((fn) => {
    const result = fn();
    fn = fn.toString();
    if (!fn.startsWith("()"))
      throw new Error(
          "Expect function expects arrow functions as input."
      );
    if (!result)
      throw new Error(
          "Validation failed: " + fn.substring(fn.indexOf("=>") + 2).trim()
      );
  });
};

function validExtension(file) {
  return file.endsWith(".js") || file.endsWith(".ts") || file.endsWith(".mjs");
}
export const command = (...r) => r;
export const event = (...r) => r;

Guild.prototype.sendCommands = async function () {
  /** @var {Bot} */
  const bot = this.client;
  if (!(bot instanceof Bot)) return false;
  await this.commands.fetch({ cache: true });
  const pk = bot
      .getSlashCommands()
      .map((i) => [
        i.file,
        typeof i.build === "function" ? i.build(this) : i.build,
      ])
      .filter((i) => i[0] && i[1]);
  let obj = {};
  for (const p of pk.sort(
      (a, b) => [a[1].name, b[1].name].sort().indexOf(a[1].name) * 2 - 1
  )) {
    obj[p[0]] = p[1].toJSON();
  }
  let old = bot.__guildPackets[this.id];
  if (old && typeof old === "string") old = bot.__guildPackets[old];
  const objJ = JSON.stringify(obj);
  if (JSON.stringify(old) === objJ) return;
  for (const id in bot.__guildPackets) {
    if (JSON.stringify(bot.__guildPackets[id]) === objJ) {
      obj = id;
      break;
    }
  }
  bot.__guildPackets[this.id] = obj;
  bot.__guildPacketsNeedUpdate = true;
  const r = await this.commands.set(pk.map((i) => i[1])).catch((e) => e);
  console.debug("Slash commands updated for the server " + this.id);
  if (r instanceof Error) {
    console.warn("Failed to send server package to the server: " + this.id);
    console.error(r);
  }
  return !(r instanceof Error);
};

let fId = 0;

const cwdClear = (pt) => {
  if (pt.startsWith(process.cwd()))
    return "." + pt.substring(process.cwd().length).replaceAll("\\", "/");
  return pt.replaceAll("\\", "/");
};

export default class Bot extends Client {
  #readyPromise;
  #slashCommands = {};
  #eventHandlers = {};
  #watching = false;
  __guildPackets = {};
  __guildPacketsNeedUpdate = false;
  eventWatchers = new Set();
  commandWatchers = new Set();
  typescriptConfig = existsSync("tsconfig.json")
      ? JSON.parse(readFileSync("tsconfig.json", "utf8"))
      : {
        compilerOptions: {
          target: "es2022",
          lib: ["es2022"],
          module: "es2022",
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          strict: true,
          skipLibCheck: true,
          moduleResolution: "Node",
        },
      };
  #eventOpts = [
    "event",
    this.#eventHandlers,
    (event, path) => {
      const old = this.#eventHandlers[path];
      if (old) this.off(old[0], old[1]);
      const eN = event.name;
      event = event.default;
      const h = (this.#eventHandlers[path] =
          typeof event[0] === "string"
              ? event
              : [eN || parsePath(path).name, event[0]]);
      h.push(event.once ? "once" : "on");
      this[h[2]](h[0], h[1]);
      this.eventWatchers.add(dirname(path));
    },
    ([name, callback]) => this.off(name, callback),
  ];
  #commandOpts = [
    "command",
    this.#slashCommands,
    (command, path) => {
      command = { ...command };
      const def = command.default;
      if (Array.isArray(def)) {
        if (def.length === 1) {
          command = { ...command, default: def[0] };
        } else if (def.length >= 2) {
          command = { ...command, build: def[0], default: def[1] };
        } else throw new Error("Invalid command structure.");
      } else if (
          typeof def === "function" &&
          def.prototype &&
          def.prototype.constructor === def
      ) {
        const cmd = new def(this);
        command = { ...command, build: cmd.build, default: cmd.execute };
      } else if (def instanceof Command) {
        command = { ...command, build: def.build, default: def.execute };
      }
      if (
          !(command.build instanceof SlashCommandBuilder) &&
          !(command.build instanceof ContextMenuCommandBuilder)
      )
        throw "Builder not found.";
      if (
          typeof command.default !== "function" &&
          typeof command.default !== "object"
      )
        throw "Executor not found.";
      command.file = path;
      this.#slashCommands[path] = command;
      this.commandWatchers.add(dirname(path));
    },
    (r) => r,
  ];

  constructor(options = {}) {
    if (typeof options !== "object") options = {};
    if (!options.intents)
      options.intents = Object.values(GatewayIntentBits).filter(Number);
    options.token = options.token || process.env.TOKEN;
    const tk = options.token;
    delete options.token;
    super(options);
    this.#readyPromise = new Promise((r) => this.once("ready", r));
    this.token = tk;
    /** @param {ChatInputCommandInteraction | ContextMenuCommandInteraction} interaction */
    const InteractionHandler = async (interaction) => {
      if (
          interaction instanceof ChatInputCommandInteraction ||
          interaction instanceof ContextMenuCommandInteraction
      ) {
        const cmd = this.getSlashCommands().find(
            (i) =>
                this.__guildPackets[interaction.guildId][i.file].name ===
                interaction.commandName
        );
        if (cmd) {
          const build = this.__guildPackets[interaction.guildId][cmd.file];
          try {
            if (interaction instanceof ChatInputCommandInteraction) {
              const group = interaction.options.getSubcommandGroup(false);
              const sub = interaction.options.getSubcommand(false);
              let args = this.#handleArguments(interaction.options.data);
              if (group) args = args[group];
              if (sub) args = args[sub];
              if (typeof cmd.default === "function") {
                await cmd.default(this, interaction, args, group, sub);
              } else if (typeof cmd.default === "object") {
                if (group) {
                  if (
                      typeof cmd.default[group] === "object" &&
                      typeof cmd.default[group][sub] === "function"
                  ) {
                    cmd.default[group][sub](this, interaction, args, group, sub);
                  }
                } else {
                  if (typeof cmd.default[sub] === "function") {
                    cmd.default[sub](this, interaction, args, group, sub);
                  }
                }
              }
            } else if (interaction instanceof ContextMenuCommandInteraction) {
              cmd.default(this, interaction, ...interaction.options.data.map((i) => i[i.name]));
            }
          } catch (e) {
            console.error(
                "An error occurred while executing the command: " +
                build.name +
                ", user: " +
                interaction.user.id
            );
            console.error(e);
            try {
              await interaction.reply({
                content: "An error occurred while executing this command. Please try later.",
                ephemeral: true,
              });
            } finally {
            }
          }
        }
      }
    };
    this.on("interactionCreate", InteractionHandler);
  }

  static create(options = {}) {
    return new Bot(options);
  }

  #__arg__sub = (data, args) =>
      this.#handleArguments(data.options, (args[data.name] = {}));

  #__arg__normal = (data, args) => (args[data.name] = data.value);

  #argumentHandler = {
    [ApplicationCommandOptionType.Subcommand]: this.#__arg__sub,
    [ApplicationCommandOptionType.SubcommandGroup]: this.#__arg__sub,
    [ApplicationCommandOptionType.String]: this.#__arg__normal,
    [ApplicationCommandOptionType.Integer]: this.#__arg__normal,
    [ApplicationCommandOptionType.Boolean]: this.#__arg__normal,
    [ApplicationCommandOptionType.Number]: this.#__arg__normal,
    [ApplicationCommandOptionType.User]: (data, args) =>
        (args[data.name] = data.member),
    [ApplicationCommandOptionType.Channel]: (data, args) =>
        (args[data.name] = data.channel),
    [ApplicationCommandOptionType.Role]: (data, args) =>
        (args[data.name] = data.role),
    [ApplicationCommandOptionType.Mentionable]: (data, args) =>
        (args[data.name] = data.role || data.member),
    [ApplicationCommandOptionType.Attachment]: (data, args) =>
        (args[data.name] = data.attachment),
  };

  #handleArguments(data, args = {}) {
    for (const dat of data) this.#argumentHandler[dat.type](dat, args);
    return args;
  }

  async waitReady() {
    await this.#readyPromise;
  }

  checkTypeScriptConfig() {
    if (!existsSync("tsconfig.json"))
      writeFileSync(
          "tsconfig.json",
          JSON.stringify(this.typescriptConfig, null, 2)
      );
  }

  /*** @returns {any[]} */
  getSlashCommands() {
    return Object.values(this.#slashCommands);
  }

  getSlashCommandsFor(guildId) {
    return this.getSlashCommands().map((cmd) => ({
      build: this.__guildPackets[guildId][cmd.file],
      default: cmd.default,
      file: cmd.file,
    }));
  }

  async broadcastCommands() {
    for (const guild of this.guilds.cache.toJSON()) await guild.sendCommands();
  }

  async #register(
      path,
      pseudoFile,
      type,
      prv,
      addCb,
      broadcastCommands = false
  ) {
    if (!validExtension(path) || basename(path).startsWith("_")) return false;
    let r;
    let p2;
    let hasErr = false;
    try {
      p2 = path;
      if (pseudoFile) {
        p2 = join(dirname(path), "_" + fId++ + basename(path));
        const auto = "/** BU DOSYA OTOMATİK OLARAK OLUŞTURULDU **/ ";
        if (p2.endsWith(".ts") || p2.endsWith(".cts") || p2.endsWith(".mts")) {
          p2 = p2.substring(0, p2.length - 2) + "js";
          writeFileSync(
              p2,
              auto +
              ts.transpileModule(readFileSync(path).toString(), {
                compilerOptions: {
                  target: ts.ScriptTarget.ES2020,
                  module: ts.ModuleKind.ES2022,
                },
              }).outputText
          );
        } else writeFileSync(p2, auto + readFileSync(path, "utf8"));
        r = await import(pathToFileURL(p2));
      } else r = await import(pathToFileURL(p2));
      addCb(r, path);
    } catch (e) {
      console.warn(type + " dosyası işlenemedi: " + path);
      console.error(e);
      hasErr = true;
    }
    if (p2 && existsSync(p2)) rmSync(p2);
    if (broadcastCommands && !hasErr) await this.broadcastCommands();
    return hasErr ? 1 : true;
  }

  async #registerAll(
      folder,
      pseudoFile,
      type,
      prv,
      addCb,
      rmCb,
      broadcastCommands = false
  ) {
    folder = join(folder);
    if (!existsSync(folder)) mkdirSync(folder);
    const files = readdirSync(folder);
    for (const file in prv) {
      const p = join(folder, file);
      if (file.startsWith(folder) && !files.includes(p)) {
        rmCb(prv[p]);
        delete prv[p];
      }
    }
    let hasErr = false;
    for (const file of files) {
      if (
          (await this.#register(
              join(folder, file),
              pseudoFile,
              type,
              prv,
              addCb,
              false
          )) === 1
      )
        hasErr = true;
    }
    if (broadcastCommands && !hasErr) await this.broadcastCommands();
    this[type + "Watchers"].add(folder);
  }

  async registerEvent(path, pseudoFile = true) {
    await this.#register(path, pseudoFile, ...this.#eventOpts);
  }

  async registerCommand(path, pseudoFile = true, broadcastCommands = true) {
    await this.#register(
        path,
        pseudoFile,
        ...this.#commandOpts,
        broadcastCommands
    );
  }

  async registerEvents(
      folder = join(process.cwd(), "events"),
      pseudoFile = true
  ) {
    await this.#registerAll(folder, pseudoFile, ...this.#eventOpts);
  }

  async registerCommands(
      folder = join(process.cwd(), "commands"),
      pseudoFile = true,
      broadcastCommands = true
  ) {
    await this.#registerAll(
        folder,
        pseudoFile,
        ...this.#commandOpts,
        broadcastCommands
    );
  }

  startWatcher(pseudoFile = true) {
    expect(() => !this.#watching);
    const cache = {};
    const loop = async () => {
      if (!this.#watching) return;
      const d = (a) =>
          a
              .map((i) =>
                  readdirSync(i)
                      .filter((i) => validExtension(i) && !i.startsWith("_"))
                      .map((f) => join(i, f))
              )
              .flat();
      const events = d([...this.eventWatchers]);
      const commands = d([...this.commandWatchers]);
      for (const fl in this.#eventHandlers) {
        if (!events.includes(fl)) {
          console.log("Event deleted: " + fl);
          this.#eventOpts[3](this.#eventHandlers[fl]);
          delete this.#eventHandlers[fl];
        }
      }
      for (const fl in this.#slashCommands) {
        if (!commands.includes(fl)) {
          console.log("Command deleted: " + cwdClear(fl));
          this.#commandOpts[3](this.#slashCommands[fl]);
          delete this.#slashCommands[fl];
        }
      }
      for (const fl of events) {
        try {
          const c = cache[fl];
          const stats = statSync(fl);
          if (c === stats.mtimeMs) continue;
          cache[fl] = stats.mtimeMs;
          if (!c && this.#eventHandlers[fl]) continue;
          console.log(
              "Event " +
              (this.#eventHandlers[fl] ? "updated" : "created") +
              ": " +
              cwdClear(fl)
          );
          await this.registerEvent(fl, pseudoFile);
        } finally {
        }
      }
      let update = false;
      for (const fl of commands) {
        try {
          const c = cache[fl];
          const stats = statSync(fl);
          if (c === stats.mtimeMs) continue;
          cache[fl] = stats.mtimeMs;
          if (!c && this.#slashCommands[fl]) continue;
          console.log(
              "Command " +
              (this.#slashCommands[fl] ? "updated" : "created") +
              ": " +
              cwdClear(fl)
          );
          await this.registerCommand(fl, pseudoFile, false);
          update = true;
        } finally {
        }
      }
      if (update) await this.broadcastCommands();
      setTimeout(loop, 100);
    };
    this.#watching = true;
    loop().then((r) => r);
  }

  stopWatcher() {
    expect(() => this.#watching);
    this.#watching = false;
  }

  async login(token) {
    const r = await super
        .login(token)
        .then(() => true)
        .catch((e) => e);
    if (r instanceof Error) {
      let err;
      switch (r.code) {
        case "TokenInvalid":
          err = "Invalid token!";
          break;
        case "ENOTFOUND":
          err =
              "Is discord down?\n" +
              "https://discordstatus.com\n" +
              "https://downdetector.com/status/discord";
          break;
        case "DisallowedIntents":
          err = "Some intents you've enabled for the bot are disallowed. \nMake sure to enable Privileged Gateway Intents on your page: https://discord.com/developers/applications";
          break;
        case "ECONNRESET":
          err = "Connection has been reset.";
          break;
        default:
          err = "Failed to log in to Discord! Error code: " + r.code;
      }
      throw new Error(err);
    }
    return token;
  }

}

export class Terminal {
  #commands = {};
  #aliases = {};

  constructor(client, stdin = process.stdin) {
    this.client = client;
    this.stdin = stdin;
    let firstEval = true;
    const evl = async (code, rn) => {
      if (firstEval)
        console.warn(
            "Using the evaluation function can be risky! Please do not use this command in a production environment! Results of evaluations will not be saved anywhere for security purposes."
        );
      firstEval = false;
      while (code.endsWith("^")) {
        code = code.substring(0, code.length - 1);
        this.stdin.resume();
        process.stdout.write("... ");
        code +=
            "\n" +
            (await new Promise((r) =>
                this.stdin.once("data", (d) => r(d.toString().trimEnd()))
            ));
      }
      this.stdin.pause();
      console.info("Evaluating...");
      const result = await new Promise((r) => setTimeout(r, 1)).then(() =>
          eval(code)
      );
      if (rn) console.log(result);
    };
    this.stdin.on("data", async (data) => {
      const m = data.toString().trim();
      if (m.startsWith(">")) await evl(m.substring(1).trim(), true);
      else if (m.startsWith(":")) await this.run(m.substring(1));
      else await this.run(m);
    });
  }

  registerCommand(name, callback, aliases = []) {
    if (this.#commands[name]) throw new Error("This command already exists: " + name);
    this.#commands[name] = callback;
    for (const alias of aliases) this.#aliases[alias] = name;
  }

  async run(name, ...args) {
    const cmd = this.#commands[name] || this.#commands[this.#aliases[name]];
    if (!cmd) throw new Error("Undefined command: " + name);
    await cmd(this.client, ...args);
  }
}

class Command {
  #client;

  constructor(client) {
    this.#client = client;
  }

  execute() {}
}

export class SlashCommand extends Command {}

export class ContextMenuCommand extends Command {}

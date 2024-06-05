import {
    ChatInputCommandInteraction,
    Client,
    ClientEvents,
    ClientOptions,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Guild,
    Message,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    User
} from "discord.js";
import {ReadStream} from "tty";
import {ApplicationCommandType} from "discord-api-types/v10";


type SlashBuilder =
    SlashCommandBuilder
    | SlashCommandSubcommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandGroupBuilder
    | SlashCommandSubcommandsOnlyBuilder;
type ContextMenuType = ApplicationCommandType.Message | ApplicationCommandType.User;
type ContextMenuBuilder<T extends ContextMenuType, K extends ContextMenuCommandBuilder = ContextMenuCommandBuilder> =
    K["type"] extends T ? K : never;

type DoBot<T, K extends boolean = true> = T & {
    client: Bot<K>
};
type NewClientOptions = ClientOptions & {
    token: string
};
type SlashExecutorFunction = (client: Client, interaction: DoBot<ChatInputCommandInteraction>, args: Record<string, any>, group?: string, sub?: string) => any;
type SlashExecutor =
    SlashExecutorFunction |
    Record<string, SlashExecutorFunction> |
    Record<string, Record<string, SlashExecutorFunction>>;

type ContextMenuExecutor<T extends ContextMenuType> = (client: Client, interaction: DoBot<ContextMenuCommandInteraction>, interacted: T extends ApplicationCommandType.Message ? Message : User) => any;

type ContextMenuBuildProperty<T extends ContextMenuType> =
    ContextMenuBuilder<T>
    | ((guild: Guild, client: Bot) => ContextMenuBuilder<T>);
type SlashBuildProperty = SlashBuilder | ((guild: Guild, client: Bot) => SlashBuilder);

type CommandSavedSlash = {
    default: SlashExecutor,
    build: SlashBuilder | ((guild: Guild) => SlashBuilder),
    file: string
};
type CommandSavedContextMenu<T extends ContextMenuType> = {
    default: ContextMenuExecutor<T>,
    build: ContextMenuBuilder<T> | ((guild: Guild) => ContextMenuBuilder<T>),
    file: string
};
type CommandSaved = CommandSavedSlash | CommandSavedContextMenu<ContextMenuType>;
type CommandSavedGuild = Exclude<CommandSaved, { build: Function }>

declare module "discord.js" {
    // @ts-ignore
    export class Guild extends Guild {
        sendCommands(): Promise<void>;
    }

    // @ts-ignore
    export {Bot as Client};

    // @ts-ignore
    export abstract class Base {
        // @ts-ignore
        public constructor(client: Bot<true>);

        public readonly client: Bot<true>;

        public toJSON(...props: Record<string, boolean | string>[]): unknown;

        public valueOf(): string;
    }
}

export function command<T extends ContextMenuType>(build: ContextMenuBuildProperty<T>, command: ContextMenuExecutor<T>): any;
export function command(build: SlashBuildProperty, command: SlashExecutor): any;
export function command<T extends ContextMenuType>(command: ContextMenuExecutor<T>): any;
export function command(command: SlashExecutor): any;

export function event<T extends keyof ClientEvents>(name: T, callback: (...args: ClientEvents[T]) => any): any;
export function event<T extends keyof ClientEvents>(name: T): any;

export default class Bot<Ready extends boolean = boolean> extends Client<Ready> {
    constructor(options?: Partial<NewClientOptions>);

    static create(options?: Partial<NewClientOptions>): Bot;

    waitReady(): Promise<void> | any;

    broadcastCommands(): Promise<void> | any;

    getCommands(): CommandSaved[];

    getCommandsFor(guild: Guild): CommandSavedGuild[];

    registerEvent(path: string, pseudoFile?: boolean): Promise<void> | any;

    registerCommand(path: string, pseudoFile?: boolean, broadcastCommands?: boolean): Promise<void> | any;

    registerEvents(folder?: string, pseudoFile?: boolean): Promise<void> | any;

    registerCommands(folder?: string, pseudoFile?: boolean, broadcastCommands?: boolean): Promise<void> | any;

    startWatcher(pseudoFile?: boolean): void;

    stopWatcher(): void;
}

export class Terminal {
    client: Bot;
    stdin: ReadStream & {
        fd: 0;
    };

    constructor(client: Bot, stdin?: ReadStream & {
        fd: 0;
    });

    listen(): void;

    registerCommand(name: string, executor: (args: string[]) => any, aliases?: string[]): void;

    unregisterCommand(name: string): void;

    getCommand(name: string): (args: string[]) => any;

    dispatchCommand(name: string, args: string[]): Promise<void>;
}

declare abstract class Command<T, K> {
    abstract build: T;

    execute: K;
}

export abstract class SlashCommand<T extends SlashBuildProperty = SlashBuildProperty> extends Command<T, SlashExecutor> {
}

export abstract class ContextMenuCommand<
    K extends ContextMenuType = ContextMenuType,
    T extends ContextMenuBuildProperty<K> = ContextMenuBuildProperty<K>
> extends Command<T, ContextMenuExecutor<K>> {
}
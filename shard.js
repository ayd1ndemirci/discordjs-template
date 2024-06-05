import { ShardingManager } from "discord.js";
import fs from 'fs';
import readline from 'readline';
import "dotenv/config";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function promptForToken() {
    return new Promise((resolve) => {
        rl.question('Please enter your bot token: ', (token) => {
            resolve(token);
        });
    });
}

async function updateEnvFile(newToken) {
    return new Promise((resolve, reject) => {
        fs.appendFile('.env', `\nTOKEN=${newToken}`, (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

async function startShards() {
    if (!process.env.TOKEN) {
        console.log('Bot token is not found in .env file.');
        const newToken = await promptForToken();
        rl.close();
        await updateEnvFile(newToken);
        process.env.TOKEN = newToken; // Update process.env with the new token
    }

    const manager = new ShardingManager('./start.js', {
        totalShards: "auto",
        execArgv: ["--max-old-space-size=2048", "--trace-warnings"],
        token: process.env.TOKEN,
    });

    manager.on('shardCreate', shard => {
        shard.on('death', () => console.warn(`Shard ${shard.id + 1} sent a death event!`));
        shard.on('ready', () => console.log(`Shard ${shard.id + 1} is now running and active!`));
        shard.on('error', err => console.error(`Error occurred in Shard ${shard.id + 1}: \n` + (err.message ? err.message : err)));
    });

    manager.spawn({ timeout: 180000 }).catch(console.error);
}

startShards();

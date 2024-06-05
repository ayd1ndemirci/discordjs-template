import Bot from "./app.js";
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
    fs.readFile('.env', 'utf8', (err, data) => {
      if (err) return reject(err);

      let newData = data;
      const tokenRegex = /^TOKEN=(.*)$/gm;
      let match;
      let found = false;

      while ((match = tokenRegex.exec(data)) !== null) {
        found = true;
        newData = newData.replace(match[0], `${match[0]}${newToken}`);
      }

      if (!found) {
        newData += `\nTOKEN=${newToken}`;
      }

      fs.writeFile('.env', newData, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

async function startBot() {
  if (!process.env.TOKEN) {
    console.log('Bot token is not found in .env file.');
    const newToken = await promptForToken();
    rl.close();
    await updateEnvFile(newToken);
    process.env.TOKEN = newToken;
  }

  const bot = Bot.create();
  try {
    await bot.login();
  } catch (e) {
    console.error(e.message);
    process.exit();
  }

  await bot.waitReady();
  await bot.registerCommands();
  await bot.registerEvents();
  await bot.startWatcher();
  console.info("Bot aktif!");
}

startBot();

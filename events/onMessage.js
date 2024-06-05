import {event} from "../app.js";

export default event("messageCreate", async message => {
    if (message.content === "ping") {
        await message.reply("Pong!");
    }
});
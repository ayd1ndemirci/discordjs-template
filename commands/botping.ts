import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { command } from "../app.js";

export default command(
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Show the bot's ping"),

    async (client, interaction) => {
        const ping = client.ws.ping;
        const embed = new EmbedBuilder()
            .setTitle("Pong!")
            .setDescription(`Bot's ping is ${ping}ms.`)
            .setColor("Blurple");

        const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
        const messagePing = reply.createdTimestamp - interaction.createdTimestamp;

        embed.addFields(
            { name: 'API Latency', value: `${ping}ms`, inline: true },
            { name: 'Message Latency', value: `${messagePing}ms`, inline: true }
        );

        await interaction.editReply({ embeds: [embed] });
    }
);

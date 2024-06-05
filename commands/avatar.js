import { Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { SlashCommand } from "../app.js";

export default class MyCommand extends SlashCommand {
    build = new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Show user's avatar")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Select a user to view their avatar.")
                .setRequired(false)
        );

    async execute(client, interaction) {
        const user = interaction.options.getUser("user") || interaction.user;
        const embed = new EmbedBuilder()
            .setColor("Blue")
            .setAuthor({ name: `Avatar: ${user.username}` })
            .setImage(
                `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
            );
        interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

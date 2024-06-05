import {SlashCommandBuilder, EmbedBuilder} from "discord.js";
import {SlashCommand} from "../app.js";
import moment from "moment";

export default class MyCommand extends SlashCommand {
    build = new SlashCommandBuilder()
        .setName("uptime")
        .setDescription("Show uptime");

    async execute(client, interaction) {

        const uptime = moment
            .duration(client.uptime)
            .humanize('D [gün], H [saat], m [dakika], s [saniye]');
        const embed = new EmbedBuilder()
            .setTitle("Aspar")
            .setDescription(`Uptime: ${uptime}`)
            .setColor("Blue")
        interaction.reply({embeds: [embed]})
    }
};
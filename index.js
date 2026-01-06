import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder
} from "discord.js";
import fs from "fs";
import "dotenv/config";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const giveawaysFile = "./giveaways.json";
if (!fs.existsSync(giveawaysFile)) fs.writeFileSync(giveawaysFile, "{}");

const loadGiveaways = () =>
  JSON.parse(fs.readFileSync(giveawaysFile, "utf8"));
const saveGiveaways = (data) =>
  fs.writeFileSync(giveawaysFile, JSON.stringify(data, null, 2));

const parseDuration = (input) => {
  const match = input.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
};

client.once("ready", async () => {
  console.log(`${client.user.tag} online`);

  const commands = [
    new SlashCommandBuilder()
      .setName("gstart")
      .setDescription("Start a giveaway")
      .addStringOption(o =>
        o.setName("prize").setDescription("Prize").setRequired(true))
      .addStringOption(o =>
        o.setName("duration").setDescription("10m / 2h / 1d").setRequired(true))
      .addIntegerOption(o =>
        o.setName("winners").setDescription("Winner count").setRequired(true)),

    new SlashCommandBuilder()
      .setName("gend")
      .setDescription("End a giveaway")
      .addStringOption(o =>
        o.setName("message_id").setDescription("Giveaway message ID").setRequired(true)),

    new SlashCommandBuilder()
      .setName("greroll")
      .setDescription("Reroll a giveaway")
      .addStringOption(o =>
        o.setName("message_id").setDescription("Giveaway message ID").setRequired(true)),

    new SlashCommandBuilder()
      .setName("glist")
      .setDescription("List active giveaways")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands
  });

  console.log("Slash commands registered");
});

client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const giveaways = loadGiveaways();
  const roleRequired = process.env.GIVEAWAY_ROLE_ID;

  if (["gstart", "gend", "greroll"].includes(i.commandName)) {
    if (!i.member.roles.cache.has(roleRequired)) {
      return i.reply({ content: "❌ You don't have permission", ephemeral: true });
    }
  }

  if (i.commandName === "gstart") {
    const prize = i.options.getString("prize");
    const durationInput = i.options.getString("duration");
    const winners = i.options.getInteger("winners");

    const duration = parseDuration(durationInput);
    if (!duration)
      return i.reply({ content: "❌ Use 10m / 2h / 1d", ephemeral: true });

    const endTime = Date.now() + duration;

    const embed = new EmbedBuilder()
      .setTitle("🎉 GIVEAWAY 🎉")
      .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\nEnds <t:${Math.floor(endTime/1000)}:R>`)
      .setColor("Gold");

    const msg = await i.channel.send({ embeds: [embed] });
    giveaways[msg.id] = {
      channel: i.channel.id,
      prize,
      winners,
      endTime
    };
    saveGiveaways(giveaways);

    await i.reply({ content: "✅ Giveaway started", ephemeral: true });

    setTimeout(() => endGiveaway(msg.id), duration);
  }

  if (i.commandName === "gend") {
    await endGiveaway(i.options.getString("message_id"), i);
  }

  if (i.commandName === "greroll") {
    await endGiveaway(i.options.getString("message_id"), i, true);
  }

  if (i.commandName === "glist") {
    const list = Object.keys(giveaways);
    if (!list.length)
      return i.reply("No active giveaways");
    i.reply(list.map(id => `• ${id}`).join("\n"));
  }
});

async function endGiveaway(id, interaction = null, reroll = false) {
  const giveaways = loadGiveaways();
  const data = giveaways[id];
  if (!data) return;

  const channel = await client.channels.fetch(data.channel);
  const msg = await channel.messages.fetch(id);

  const members = (await channel.guild.members.fetch())
    .filter(m => !m.user.bot)
    .map(m => m);

  const winners = [];
  while (winners.length < data.winners && members.length) {
    const pick = members.splice(Math.floor(Math.random()*members.length), 1)[0];
    winners.push(pick);
  }

  await channel.send(
    `🎉 **${data.prize}**\nWinners: ${winners.map(w => w.user).join(", ")}`
  );

  delete giveaways[id];
  saveGiveaways(giveaways);

  if (interaction)
    interaction.reply({ content: "✅ Done", ephemeral: true });
}

client.login(process.env.TOKEN);

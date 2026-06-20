import {
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import Users from "../../../User/Mongodb/Schema/user.js";
import Profiles from "../../../User/Mongodb/Schema/profiles.js";
import Friends from "../../../User/Mongodb/Schema/friends.js";
export const data = new SlashCommandBuilder()
  .setName("deleteaccount")
  .setDescription("Deletes your account (irreversible)");
export async function execute(interaction) {
  const user = await Users.findOne({ discordId: interaction.user.id });
  if (!user)
    return interaction.reply({
      content: "You are not registered!",
      ephemeral: true,
    });
  if (user.banned)
    return interaction.reply({
      content: "You are banned, and your account cannot therefore be deleted.",
      ephemeral: true,
    });
  const confirm = new ButtonBuilder()
    .setCustomId("confirm")
    .setLabel("Confirm Deletion")
    .setStyle(ButtonStyle.Danger);
  const cancel = new ButtonBuilder()
    .setCustomId("cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);
  const row = {
    type: 1,
    components: [confirm.toJSON(), cancel.toJSON()],
  };
  const confirmationEmbed = new EmbedBuilder()
    .setTitle("Are you sure you want to delete your account?")
    .setDescription(
      "This action is irreversible, and will delete all your data."
    )
    .setColor("#DBB959")
    .setFooter({
      text: Saftey.env.BACKEND_NAME,
      iconURL:
        "https://cdn.discordapp.com/attachments/1237602824465158224/1279078756815867974/HelixLogoTransparent.png?ex=66d3cb2b&is=66d279ab&hm=a21f9e291f9e0936d0a6220525c4e65fa8131ba9f653b37b8019edb018de7a0c&",
    })
    .setTimestamp();
  const confirmationResponse = await interaction.reply({
    embeds: [confirmationEmbed],
    components: [row],
    ephemeral: true,
  });
  const filter = (i) => i.user.id === interaction.user.id;
  const collector = confirmationResponse.createMessageComponentCollector({
    filter,
    time: 10000,
  });
  collector.on("collect", async (i) => {
    switch (i.customId) {
      case "confirm": {
        await Users.findOneAndDelete({ discordId: interaction.user.id });
        await Profiles.findOneAndDelete({ accountId: user.accountId });
        await Friends.findOneAndDelete({ accountId: user.accountId });
        const confirmEmbed = new EmbedBuilder()
          .setTitle("Account Deleted")
          .setDescription(
            "Your account has been deleted, we're sorry to see you go!"
          )
          .setColor("#2B2D31")
          .setFooter({
            text: Saftey.env.BACKEND_NAME,
            iconURL:
              "https://cdn.discordapp.com/attachments/1237602824465158224/1279078756815867974/HelixLogoTransparent.png?ex=66d3cb2b&is=66d279ab&hm=a21f9e291f9e0936d0a6220525c4e65fa8131ba9f653b37b8019edb018de7a0c&",
          })
          .setTimestamp();
        i.reply({ embeds: [confirmEmbed], ephemeral: true });
        break;
      }
      case "cancel": {
        const cancelEmbed = new EmbedBuilder()
          .setTitle("Account Deletion Cancelled")
          .setDescription("Your account has not been deleted.")
          .setColor("#2B2D31")
          .setFooter({
            text: Saftey.env.BACKEND_NAME,
            iconURL:
              "https://cdn.discordapp.com/attachments/1237602824465158224/1279078756815867974/HelixLogoTransparent.png?ex=66d3cb2b&is=66d279ab&hm=a21f9e291f9e0936d0a6220525c4e65fa8131ba9f653b37b8019edb018de7a0c&",
          })
          .setTimestamp();
        i.reply({ embeds: [cancelEmbed], ephemeral: true });
        break;
      }
    }
  });
}
//# sourceMappingURL=delete.js.map

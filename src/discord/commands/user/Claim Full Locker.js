import path from "path";
import fs from "fs";
import { dirname } from "dirname-filename-esm";
import { SlashCommandBuilder } from "discord.js";
import Users from "../../../User/Mongodb/Schema/user.js";
import Profiles from "../../../User/Mongodb/Schema/profiles.js";
import destr from "destr";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import log from "../../../Utils/structs/log.js";
import Saftey from "../../../Utils/safety.js"

const REQUIRED_ROLE_ID = '1517959562236264540';

const WEBHOOK_URL = Saftey.env.LOG_WEBHOOK;

async function sendWebhookLog(discordUser, action, status, details = {}) {
  const webhookEmbed = {
    embeds: [
      {
        title: "Full Locker Claim",
        description: `A user attempted to claim a full locker: ${status}`,
        color: status === 'Success' ? 0x9370db : 0xff0000,
        fields: [
          {
            name: "Action",
            value: action,
            inline: true,
          },
          {
            name: "Discord ID",
            value: discordUser.id,
            inline: true,
          },
          {
            name: "Username",
            value: discordUser.username || 'Unknown',
            inline: true,
          },
          ...(Object.keys(details).map(key => ({
            name: key,
            value: details[key],
            inline: true,
          }))),
        ],
        thumbnail: {
          url: discordUser.displayAvatarURL({ dynamic: true }),
        },
        timestamp: new Date().toISOString(),
        footer: {
          text: "Reward System",
          icon_url:
            "https://cdn.discordapp.com/app-assets/432980957394370572/1084188429077725287.png",
        },
      },
    ],
  };

  try {
    await axios.post(WEBHOOK_URL, webhookEmbed);
    log.backend(`Successfully sent webhook for ${action} (${status})`);
  } catch (error) {
    log.error(`Failed to send webhook for ${action}: ${error.message}`);
  }
}

export const data = new SlashCommandBuilder()
  .setName("claim-full-locker")
  .setDescription(
    "Claim Full Locker"
  )
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.member.roles.cache.has(REQUIRED_ROLE_ID)) {
    await sendWebhookLog(interaction.user, 'Claim Attempt', 'Failed', { Reason: 'Missing required role' });
    return interaction.editReply({ content: 'You do not have the required role to use this command.' });
  }

  const __dirname = dirname(import.meta);
  const userId = interaction.user.id;
  const user = await Users.findOne({ discordId: userId });
  if (!user) {
    await sendWebhookLog(interaction.user, 'Claim Attempt', 'Failed', { Reason: 'User does not own an account' });
    return interaction.editReply({
      content: "You do not own an account",
      ephemeral: true,
    });
  }

  const profile = await Profiles.findOne({ accountId: user.accountId });
  if (!profile) {
    await sendWebhookLog(interaction.user, 'Claim Attempt', 'Failed', { Reason: 'User does not have a profile' });
    return interaction.editReply({
      content: "You do not have a profile",
      ephemeral: true,
    });
  }

  const allItems = destr(
    fs.readFileSync(
      path.join(__dirname, "../../../../Config/FL/allathena.json"),
      "utf8"
    )
  );
  if (!allItems) {
    await sendWebhookLog(interaction.user, 'Claim Attempt', 'Failed', { Reason: 'Failed to parse allathena.json' });
    return interaction.editReply({
      content: "Failed to parse allathena.json",
      ephemeral: true,
    });
  }

  try {
    const commonCoreProfile = profile.profiles.common_core;
    const athenaProfile = profile.profiles.athena;

    await Profiles.findOneAndUpdate(
      { accountId: user.accountId },
      { $set: { "profiles.athena.items": allItems.items } },
      { new: true }
    );

    const giftBoxId = uuidv4();
    commonCoreProfile.items[giftBoxId] = {
      templateId: 'GiftBox:GB_MakeGood',
      attributes: {
        fromAccountId: '[Epic Games]',
        params: {
          DefaultHeaderText: 'Epic Games',
          userMessage: 'Enjoy Full Locker!'
        },
        lootList: Object.keys(allItems.items).map(itemKey => {
          const itemType = itemKey;
          return {
            itemType,
            itemGuid: itemType,
            quantity: 1
          };
        }),
        giftedOn: new Date().toISOString()
      },
      quantity: 1
    };

    commonCoreProfile.rvn = (commonCoreProfile.rvn || 0) + 1;
    commonCoreProfile.commandRevision = (commonCoreProfile.commandRevision || 0) + 1;

    await Profiles.updateOne(
      { accountId: user.accountId },
      { $set: { 'profiles.common_core': commonCoreProfile } }
    );

    await sendWebhookLog(interaction.user, 'Claim Full Locker', 'Success', { ItemsClaimed: Object.keys(allItems.items).length.toString() });
    await interaction.editReply({
      content: `You Have Successfully Claimed Full Locker!`,
      ephemeral: true,
    });
  } catch (error) {
    await sendWebhookLog(interaction.user, 'Claim Attempt', 'Failed', { Reason: error.message });
    log.error(`Error claiming full locker for user ${userId}: ${error.message}`);
    await interaction.editReply({
      content: 'An error occurred while claiming the full locker.',
      ephemeral: true,
    });
  }
}
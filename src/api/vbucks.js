import express from "express";
import mongoose from "mongoose";
import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import { SendEmptyGift } from "../Utils/Utils.js";
import log from "../Utils/structs/log.js";
import Safety from "../Utils/safety.js";

const PORT = 92;
const API_KEY = "84059365-25d6-486f-81f3-04b306828c35";

const connectToMongoDB = async () => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(Safety.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {
    log.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

const app = express();
app.use(express.json());

app.get(
  "/api/v1/rewards/vbucks/:username/:amount/:apiKey",
  async (req, res) => {
    const { username, amount, apiKey } = req.params;
    const vbucksAmount = parseInt(amount);

    try {
      if (apiKey !== API_KEY) {
        log.api(`Invalid API key attempt from IP: ${req.ip}`);
        throw new Error(`Invalid API key from IP: ${req.ip}`);
      }
      if (isNaN(vbucksAmount) || vbucksAmount <= 0) {
        throw new Error("Invalid VBucks amount");
      }
      if (vbucksAmount > 200) {
        log.api(
          `VBucks amount ${vbucksAmount} exceeds limit from IP: ${req.ip}`
        );
        throw new Error(`VBucks amount exceeds limit from IP: ${req.ip}`);
      }

      log.api(
        `Processing VBucks request -> Username: ${username}, Amount: ${vbucksAmount}`
      );

      const user = await User.findOne({ username }).lean();
      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      const profile = await Profile.findOne({ accountId: user.accountId }).lean();
      if (!profile) {
        throw new Error(`Profile not found for user: ${username}`);
      }

      const attributes = { ...profile.profiles.athena.stats.attributes };
      const currency = {
        ...profile.profiles.common_core.items["Currency:MtxPurchased"],
      };

      if (vbucksAmount === 50) {
        attributes.lifetime_kills = (attributes.lifetime_kills || 0) + 1;
        log.kill(`${username} got a kill!`);
      } else if (vbucksAmount === 200) {
        attributes.lifetime_wins = (attributes.lifetime_wins || 0) + 1;
        log.win(`${username} got a win!`);
      }

      currency.quantity = (currency.quantity || 0) + vbucksAmount;

      await Profile.updateOne(
        { accountId: user.accountId },
        {
          $set: {
            "profiles.athena.stats.attributes": attributes,
            "profiles.common_core.items.Currency:MtxPurchased": currency,
          },
        }
      );

      log.vbucks(`Added ${vbucksAmount} vbucks to ${username}`);
      SendEmptyGift(username, user.accountId);

      res.json({
        message: `Successfully added ${vbucksAmount} VBucks`,
      });
    } catch (error) {
      log.api(`Vbucks error for ${username}: ${error.message}`);
      res.status(error.message.includes("not found") ? 404 : 400).json({
        error: error.message,
      });
    }
  }
);

const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    log.api(`VBucks server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  log.api(`Server startup error: ${error.message}`);
  process.exit(1);
});
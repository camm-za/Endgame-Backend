import express from "express";
import mongoose from "mongoose";
import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import Safety from "../Utils/safety.js";
import { SendEmptyGift } from "../Utils/Utils.js";
import log from "../Utils/structs/log.js";

const PORT = 80;
const API_KEY = "84059365-25d6-486f-81f3-04b306828c35";
const SeasonNum = Safety.env.MAIN_SEASON;

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
  "/api/v1/rewards/season_umbrella/:username/:apiKey",
  async (req, res) => {
    const { username, apiKey } = req.params;

    try {
      if (apiKey !== API_KEY) {
        log.warn(`Invalid API key attempt from IP: ${req.ip}`);
        throw new Error(`Invalid API key from IP: ${req.ip}`);
      }

      log.umbrella(`Processing umbrella request -> Username: ${username}`);

      const user = await User.findOne({ username }).lean();
      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      const profile = await Profile.findOne({ accountId: user.accountId }).lean();
      if (!profile) {
        throw new Error(`Profile not found for user: ${username}`);
      }

      const umbrellaId = `AthenaGlider:Umbrella_Season_${SeasonNum}`;
      if (profile.profiles.athena.items[umbrellaId]?.quantity > 0) {
        log.umbrella(
          `${username} already has the season ${SeasonNum} umbrella!`
        );
        return res.json({ message: "User already has the umbrella reward" });
      }

      const updatedItems = {
        ...profile.profiles.athena.items,
        [umbrellaId]: {
          quantity: 1,
          templateId: umbrellaId,
          attributes: {
            max_level_bonus: 0,
            level: 0,
            item_seen: false,
            xp: 0,
          },
        },
      };

      await Profile.updateOne(
        { accountId: user.accountId },
        { $set: { "profiles.athena.items": updatedItems } }
      );

      log.umbrella(
        `Season ${SeasonNum} umbrella added successfully to ${username}`
      );
      SendEmptyGift(username, user.accountId);

      res.json({
        message: "Umbrella reward added successfully",
      });
    } catch (error) {
      log.error(`Season umbrella error for ${username}: ${error.message}`);
      res.status(error.message.includes("not found") ? 404 : 400).json({
        error: error.message,
      });
    }
  }
);

const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    log.api(`Season Umbrella server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  log.error(`Server startup error: ${error.message}`);
  process.exit(1);
});
import express from "express";
import mongoose from "mongoose";
import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import Safety from "../Utils/safety.js";
import log from "../Utils/structs/log.js";

const PORT = 90;
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
  "/api/v1/rewards/managehype/:username/:reason/:apiKey",
  async (req, res) => {
    const { username, reason, apiKey } = req.params;

    try {
      if (apiKey !== API_KEY) {
        log.warn(`Invalid API key attempt from IP: ${req.ip}`);
        throw new Error(`Invalid API key from IP: ${req.ip}`);
      }
      if (
        ![
          "Elimination",
          "Win",
          "Top 3",
          "Top 7",
          "Top 12",
          "Bus Fare",
        ].includes(reason)
      ) {
        log.warn(`Invalid reason attempt from IP: ${req.ip}: ${reason}`);
        throw new Error(`Invalid reason from IP: ${req.ip}`);
      }

      log.hype(
        `Processing hype request -> Username: ${username}, Reason: ${reason}`
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
      const currentHype = attributes.arena_hype || 0;
      let amount = 0;
      let removeAmount = 0;

      switch (reason) {
        case "Elimination":
          amount = 3;
          break;
        case "Win":
          amount = 6;
          break;
        case "Top 3":
          amount = 2;
          break;
        case "Top 7":
          amount = 4;
          break;
        case "Top 12":
          amount = 6;
          break;
        case "Bus Fare":
          if (currentHype >= 125) removeAmount = 1;
          else if (currentHype >= 175) removeAmount = 3;
          else if (currentHype >= 225) removeAmount = 5;
          else if (currentHype >= 300) removeAmount = 8;
          else if (currentHype >= 445) removeAmount = 8;
          else if (currentHype >= 500) removeAmount = 8;
          else if (currentHype >= 14000) removeAmount = 10;
          break;
      }

      const newHype = Math.max(0, currentHype + amount - removeAmount);
      attributes.arena_hype = newHype;

      await Profile.updateOne(
        { accountId: user.accountId },
        { $set: { "profiles.athena.stats.attributes": attributes } }
      );

      const message =
        removeAmount === 0
          ? `Successfully added ${amount} Hype`
          : `Successfully ${amount > 0 ? "added" : "removed"} Hype`;

      log.hype(`${message} for ${username}, new Hype: ${newHype}`);
      res.json({
        message,
        hype: attributes.arena_hype,
      });
    } catch (error) {
      log.error(`ManageHype error for ${username}: ${error.message}`);
      res.status(error.message.includes("not found") ? 404 : 400).json({
        error: error.message,
      });
    }
  }
);

const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    log.api(`ManageHype server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  log.error(`Server startup error: ${error.message}`);
  process.exit(1);
});
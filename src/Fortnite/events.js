import express from "express";
import fs from "fs";
import axios from "axios";
import { MongoClient } from "mongodb";
import mongoose from 'mongoose';
import Safety from '../Utils/safety.js';
import functions from "../Utils/structs/functions.js";
import log from "../Utils/structs/log.js";
import path from "path";
import { dirname } from 'dirname-filename-esm';
import { verifyToken } from "../User/tokenManager/tokenVerify.js";

const __dirname = dirname(import.meta);
const app = express.Router();

const DatabaseURL = Safety.env.MONGO_URI;
const NameFromURL = DatabaseURL.split("/");
const DatabaseName = NameFromURL[3];
const DatabaseCollectionName = 'profiles';

const userSchema = new mongoose.Schema({
    username: String,
    accountId: String
});

const profileSchema = new mongoose.Schema({
    accountId: String,
    profiles: {
        athena: {
            stats: {
                attributes: {
                    arena_hype: { type: Number, default: 0 }
                }
            }
        }
    }
});

const User = mongoose.model('users', userSchema);
const Profile = mongoose.model('profiles', profileSchema);

async function GetPlayerHype(accountid) {
const client = new MongoClient(DatabaseURL, { useNewUrlParser: true, useUnifiedTopology: true });
    
    try {
        await client.connect();
        const db = client.db(DatabaseName);
        const collection = db.collection(DatabaseCollectionName);

        const profile = await collection.findOne({ 'accountId': accountid });
        if (profile && profile.profiles && profile.profiles.athena && profile.profiles.athena.stats && profile.profiles.athena.stats.attributes) {
            return profile.profiles.athena.stats.attributes.arena_hype || 0;
        } else {
            throw new Error('Profile not found or malformed!');
        }
    } catch (error) {
        console.error(`Error fetching player hype: ${error}`);
        return 0;
    } finally {
        await client.close();
    }
}

app.get("/api/v1/events/Fortnite/download/:accountid", verifyToken, async (req, res) => {
    const seasonNum = functions.GetVersionInfo(req).season;
    const accountid = req.params.accountid;
    const user = await User.findOne({ accountId: accountid });

    if (!user) {
        res.send("No user found!");
    }

    const username = user.username;
    const arena = path.join(__dirname, `../local/events/Events.json`);
    let currentSeason = "S" + seasonNum; // <---- S8, S14, S19 bla bla bla

    let playerHype;
    try
    {
        playerHype = await GetPlayerHype(accountid);
    }
    catch (err)
    {
        log.error("Error getting player hype! Error :", err);
        res.status(500).send('Internal server error');
        return;
    }

    let playerDivision = `"LG_ARENA_${currentSeason}_Division1"`; // default division

    if (playerHype >= 16000) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5", "LG_ARENA_${currentSeason}_Division6", "LG_ARENA_${currentSeason}_Division7", "LG_ARENA_${currentSeason}_Division8", "LG_ARENA_${currentSeason}_Division9", "LG_ARENA_${currentSeason}_Division10"`;
    } else if (playerHype >= 12000) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5", "LG_ARENA_${currentSeason}_Division6", "LG_ARENA_${currentSeason}_Division7", "LG_ARENA_${currentSeason}_Division8", "LG_ARENA_${currentSeason}_Division9"`;
    } else if (playerHype >= 6000) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5", "LG_ARENA_${currentSeason}_Division6", "LG_ARENA_${currentSeason}_Division7", "LG_ARENA_${currentSeason}_Division8"`;
    } else if (playerHype >= 4000) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5", "LG_ARENA_${currentSeason}_Division6", "LG_ARENA_${currentSeason}_Division7"`;
    } else if (playerHype >= 2500) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5", "LG_ARENA_${currentSeason}_Division6"`;
    } else if (playerHype >= 1500) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4", "LG_ARENA_${currentSeason}_Division5"`;
    } else if (playerHype >= 1000) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3", "LG_ARENA_${currentSeason}_Division4"`;
    } else if (playerHype >= 500) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2", "LG_ARENA_${currentSeason}_Division3"`;
    } else if (playerHype >= 250) {
        playerDivision = `"LG_ARENA_${currentSeason}_Division1", "LG_ARENA_${currentSeason}_Division2"`;
    }

    fs.readFile(arena, 'utf-8', (err, data) => {
        if (err) {
            log.error("Error reading file:", err);
            res.status(500).send('Error reading file!!!');
            return;
        }

        let modifiedData = data.replace(/skunkyskunkyhype/g, playerHype)
                            .replace(/skunkyskunkyseason/g, currentSeason)
                            .replace(/skunkyskunkyaccountid/g, accountid)
                            .replace(/skunkyskunkydivision/g, playerDivision);

    // log.debug("modified shittt : ", modifiedData); - for testing/debug purposes

        let events;
        try {
            events = JSON.parse(modifiedData);
        } catch (parseErr) {
            log.error("Error parsing JSON:", parseErr);
            res.status(500).send('Error parsing JSON!!!');
            return;
        }

        log.arena(username + " sent an arena JSON request!");
        res.json(events);
    });
    if (Safety.env.EVENT_TYPE === "Tournament") {
        log.arena("Tournaments not set-up yet!");
    }
    else {
        log.arena("Arena is disabled, not sending json data!");
    }
}); 

app.get("/api/v1/players/Fortnite/tokens", async (req, res) => {
    res.json({});
});

app.get("/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/data/", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/:eventId/:eventWindowId/history/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/events/Fortnite/:windowId/history/:accountId", async (req, res) => {
    res.json({});
});

app.get("/api/v1/players/Fortnite/:accountId", async (req, res) => {
    res.json({
        "result": true,
        "region": "EU",
        "lang": "en",
        "season": Safety.env.MAIN_SEASON,
        "events": []
    });
});

export default app;
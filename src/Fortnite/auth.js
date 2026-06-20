import { EmbedBuilder } from "discord.js";
import express from "express";
const app = express.Router();
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import kv from "../Utils/kv.js";
import error from "../Utils/structs/error.js";
import functions from "../Utils/structs/functions.js";
import log from "../Utils/structs/log.js";
import tokenCreation from "../User/tokenManager/tokenCreation.js";
import { verifyToken } from '../User/tokenManager/tokenVerify.js';
import User from "../User/Mongodb/Schema/user.js";

function waitFor2FA(req) {
  return new Promise((resolve) => {
    const checkCondition = async () => {
      while ((await kv.get(req.user.discordId)) !== "true") {
        await new Promise((r) => setTimeout(r, 1000));
      }
      resolve();
    };
    checkCondition();
  });
}

app.post("/account/api/oauth/token", async (req, res) => {
  let clientId;
  let season;
  let rebootAccount = false;
  try {
    clientId = functions
      .DecodeBase64((req.headers["authorization"] ?? "").split(" ")[1])
      .split(":");
    season = functions.GetVersionInfo(req).build;
    log.debug(`Received token request with clientId: ${clientId[0]}, season: ${season}`);
    /*  if (season != 12.41)
            {
                log.debug(`Wrong version buddy! Bro really tried to launch ${season}`)
                return error.createError("errors.com.epicgames.common.oauth.invalid_season", "Wrong Season! The season currently being hosted by Helix is 12.41!", [], 1011, "invalid_season", 400, res);
            } */
    if (!clientId[1]) throw new Error("invalid client id");
    clientId = clientId[0];
  } catch {
    log.error("Invalid authorization header detected");
    return error.createError(
      "errors.com.epicgames.common.oauth.invalid_client",
      "It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.",
      [],
      1011,
      "invalid_client",
      400,
      res
    );
  }
  switch (req.body.grant_type) {
    case "client_credentials":
      let ip = req.ip;
      log.info(`Processing client_credentials grant for IP: ${ip}`);
      let clientToken = global.clientTokens.findIndex((i) => i.ip == ip);
      if (clientToken != -1) {
        global.clientTokens.splice(clientToken, 1);
        log.debug(`Removed existing client token for IP: ${ip}`);
      }
      const token = tokenCreation.createClient(
        clientId,
        req.body.grant_type,
        ip,
        4
      );
      functions.UpdateTokens();
      const decodedClient = jwt.decode(token);
      log.info(`Issued client token for clientId: ${clientId}, expires at: ${DateAddHours(new Date(decodedClient.creation_date), decodedClient.hours_expire).toISOString()}`);
      res.json({
        access_token: `eg1~${token}`,
        expires_in: Math.round(
          (DateAddHours(
            new Date(decodedClient.creation_date),
            decodedClient.hours_expire
          ).getTime() -
            new Date().getTime()) /
            1000
        ),
        expires_at: DateAddHours(
          new Date(decodedClient.creation_date),
          decodedClient.hours_expire
        ).toISOString(),
        token_type: "bearer",
        client_id: clientId,
        internal_client: true,
        client_service: "fortnite",
      });
      return;
    case "password":
      if (!req.body.username || !req.body.password) {
        log.error("Missing username or password in password grant request");
        return error.createError(
          "errors.com.epicgames.common.oauth.invalid_request",
          "Username/password is required.",
          [],
          1013,
          "invalid_request",
          400,
          res
        );
      }
      const { username: email, password: password } = req.body;
      const regex = /@projectreboot\.dev$/;
      rebootAccount = regex.test(email);
      log.debug(`Reboot account check: ${rebootAccount} for email: ${email}`);
      req.user = await User.findOne({ email: email.toLowerCase() }).lean();
      let err = () => {
        log.error(`Invalid credentials for email: ${email}`);
        error.createError(
          "errors.com.epicgames.account.invalid_account_credentials",
          "Your e-mail and/or password are incorrect. Please check them and try again.",
          [],
          18031,
          "invalid_grant",
          400,
          res
        );
      };
      if (!req.user) return err();
      else {
        if (!rebootAccount) {
          if (!(await bcrypt.compare(password, req.user.password)))
            return err();
        }
        log.info(`Successful password authentication for user: ${req.user.accountId}`);
      }
      break;
    case "refresh_token":
      if (!req.body.refresh_token) {
        log.error("Missing refresh token in refresh_token grant request");
        return error.createError(
          "errors.com.epicgames.common.oauth.invalid_request",
          "Refresh token is required.",
          [],
          1013,
          "invalid_request",
          400,
          res
        );
      }
      const refresh_token = req.body.refresh_token;
      let refreshToken = global.refreshTokens.findIndex(
        (i) => i.token == refresh_token
      );
      let object = global.refreshTokens[refreshToken];
      try {
        if (refreshToken == -1) throw new Error("Refresh token invalid.");
        let decodedRefreshToken = jwt.decode(refresh_token.replace("eg1~", ""));
        if (
          DateAddHours(
            new Date(decodedRefreshToken.creation_date),
            decodedRefreshToken.hours_expire
          ).getTime() <= new Date().getTime()
        ) {
          throw new Error("Expired refresh token.");
        }
        log.debug(`Valid refresh token for accountId: ${object.accountId}`);
      } catch {
        if (refreshToken != -1) {
          global.refreshTokens.splice(refreshToken, 1);
          functions.UpdateTokens();
          log.debug(`Removed invalid/expired refresh token: ${refresh_token}`);
        }
        log.error(`Invalid or expired refresh token: ${refresh_token}`);
        error.createError(
          "errors.com.epicgames.account.auth_token.invalid_refresh_token",
          `Sorry the refresh token '${refresh_token}' is invalid`,
          [refresh_token],
          18036,
          "invalid_grant",
          400,
          res
        );
        return;
      }
      req.user = await User.findOne({ accountId: object.accountId }).lean();
      log.info(`Refresh token validated for user: ${req.user.accountId}`);
      break;
    case "exchange_code":
      if (!req.body.exchange_code) {
        log.error("Missing exchange code in exchange_code grant request");
        return error.createError(
          "errors.com.epicgames.common.oauth.invalid_request",
          "Exchange code is required.",
          [],
          1013,
          "invalid_request",
          400,
          res
        );
      }
      const { exchange_code } = req.body;
      let index = global.exchangeCodes.findIndex(
        (i) => i.exchange_code == exchange_code
      );
      let exchange = global.exchangeCodes[index];
      if (index == -1) {
        log.error(`Invalid exchange code: ${exchange_code}`);
        return error.createError(
          "errors.com.epicgames.account.oauth.exchange_code_not_found",
          "Sorry the exchange code you supplied was not found. It is possible that it was no longer valid",
          [],
          18057,
          "invalid_grant",
          400,
          res
        );
      }
      global.exchangeCodes.splice(index, 1);
      req.user = await User.findOne({ accountId: exchange.accountId }).lean();
      log.info(`Exchange code validated for user: ${req.user.accountId}`);
      break;
    default:
      log.error(`Unsupported grant type: ${req.body.grant_type}`);
      error.createError(
        "errors.com.epicgames.common.oauth.unsupported_grant_type",
        `Unsupported grant type: ${req.body.grant_type}`,
        [],
        1016,
        "unsupported_grant_type",
        400,
        res
      );
      return;
  }
  if (req.user.banned === undefined) {
    log.error(`Account not found for user: ${req.user?.accountId || 'unknown'}`);
    return error.createError(
      "errors.com.epicgames.account.oauth.account_not_found",
      "Sorry the account you are trying to login to does not exist",
      [],
      18056,
      "invalid_grant",
      400,
      res
    );
  }
  if (req.user.banned) {
    log.error(`Banned account attempted login: ${req.user.accountId}`);
    return error.createError(
      "errors.com.epicgames.account.account_not_active",
      "You have been permanently banned from Fortnite.",
      [],
      -1,
      undefined,
      400,
      res
    );
  }
  let refreshIndex = global.refreshTokens.findIndex(
    (i) => i.accountId == req.user.accountId
  );
  if (refreshIndex != -1) {
    global.refreshTokens.splice(refreshIndex, 1);
    log.debug(`Removed existing refresh token for accountId: ${req.user.accountId}`);
  }
  let accessIndex = global.accessTokens.findIndex(
    (i) => i.accountId == req.user.accountId
  );
  if (accessIndex != -1) {
    global.accessTokens.splice(accessIndex, 1);
    let xmppClient = global.Clients.find(
      (i) => i.accountId == req.user.accountId
    );
    if (xmppClient) {
      xmppClient.client.close();
      log.debug(`Closed XMPP client for accountId: ${req.user.accountId}`);
    }
  }
  const deviceId = functions.MakeID().replace(/-/gi, "");
  const accessToken = tokenCreation.createAccess(
    req.user,
    clientId,
    req.body.grant_type,
    deviceId,
    8
  );
  const refreshToken = tokenCreation.createRefresh(
    req.user,
    clientId,
    req.body.grant_type,
    deviceId,
    24
  );
  functions.UpdateTokens();
  const decodedAccess = jwt.decode(accessToken);
  const decodedRefresh = jwt.decode(refreshToken);
  log.info(`Issued access and refresh tokens for accountId: ${req.user.accountId}, expires at: ${DateAddHours(new Date(decodedAccess.creation_date), decodedAccess.hours_expire).toISOString()}`);
  res.json({
    access_token: `eg1~${accessToken}`,
    expires_in: Math.round(
      (DateAddHours(
        new Date(decodedAccess.creation_date),
        decodedAccess.hours_expire
      ).getTime() -
        new Date().getTime()) /
        1000
    ),
    expires_at: DateAddHours(
      new Date(decodedAccess.creation_date),
      decodedAccess.hours_expire
    ).toISOString(),
    token_type: "bearer",
    refresh_token: `eg1~${refreshToken}`,
    refresh_expires: Math.round(
      (DateAddHours(
        new Date(decodedRefresh.creation_date),
        decodedRefresh.hours_expire
      ).getTime() -
        new Date().getTime()) /
        1000
    ),
    refresh_expires_at: DateAddHours(
      new Date(decodedRefresh.creation_date),
      decodedRefresh.hours_expire
    ).toISOString(),
    account_id: req.user.accountId,
    client_id: clientId,
    internal_client: true,
    client_service: "fortnite",
    displayName: req.user.username,
    app: "fortnite",
    in_app_id: req.user.accountId,
    device_id: deviceId,
  });
  await kv.set(req.user.discordId, "false");
  log.debug(`Set 2FA status to false for discordId: ${req.user.discordId}`);
});

app.get("/account/api/oauth/verify", verifyToken, (req, res) => {
  let token = req.headers["authorization"].replace("bearer ", "");
  const decodedToken = jwt.decode(token.replace("eg1~", ""));
  log.info(`Token verification requested for accountId: ${req.user.accountId}`);
  res.json({
    token: token,
    session_id: decodedToken.jti,
    token_type: "bearer",
    client_id: decodedToken.clid,
    internal_client: true,
    client_service: "fortnite",
    account_id: req.user.accountId,
    expires_in: Math.round(
      (DateAddHours(
        new Date(decodedToken.creation_date),
        decodedToken.hours_expire
      ).getTime() -
        new Date().getTime()) /
        1000
    ),
    expires_at: DateAddHours(
      new Date(decodedToken.creation_date),
      decodedToken.hours_expire
    ).toISOString(),
    auth_method: decodedToken.am,
    display_name: req.user.username,
    app: "fortnite",
    in_app_id: req.user.accountId,
    device_id: decodedToken.dvid,
  });
});

app.delete("/account/api/oauth/sessions/kill", (req, res) => {
  log.info("Received request to kill all sessions");
  res.status(204).end();
});

app.delete("/account/api/oauth/sessions/kill/:token", (req, res) => {
  let token = req.params.token;
  let accessIndex = global.accessTokens.findIndex((i) => i.token == token);
  if (accessIndex != -1) {
    let object = global.accessTokens[accessIndex];
    global.accessTokens.splice(accessIndex, 1);
    let xmppClient = global.Clients.find((i) => i.token == object.token);
    if (xmppClient) {
      xmppClient.client.close();
      log.debug(`Closed XMPP client for token: ${token}`);
    }
    let refreshIndex = global.refreshTokens.findIndex(
      (i) => i.accountId == object.accountId
    );
    if (refreshIndex != -1) {
      global.refreshTokens.splice(refreshIndex, 1);
      log.debug(`Removed refresh token for accountId: ${object.accountId}`);
    }
  }
  let clientIndex = global.clientTokens.findIndex((i) => i.token == token);
  if (clientIndex != -1) {
    global.clientTokens.splice(clientIndex, 1);
    log.debug(`Removed client token: ${token}`);
  }
  if (accessIndex != -1 || clientIndex != -1) {
    functions.UpdateTokens();
    log.info(`Session killed for token: ${token}`);
  }
  res.status(204).end();
});

app.post("/auth/v1/oauth/token", async (req, res) => {
  log.info("Processing Helix OAuth token request");
  res.json({
    access_token: "Helixaccesstoken",
    token_type: "bearer",
    expires_at: "9999-12-31T23:59:59.999Z",
    features: ["AntiCheat", "Connect", "Ecom"],
    organization_id: "Helixorgid",
    product_id: "prod-fn",
    sandbox_id: "fn",
    deployment_id: "Helixdeploymentid",
    expires_in: 3599,
  });
});

app.post("/epic/oauth/v2/token", async (req, res) => {
  let clientId;
  try {
    clientId = functions
      .DecodeBase64((req.headers["authorization"] || "").split(" ")[1])
      .split(":");
    log.debug(`Received Epic OAuth v2 token request for clientId: ${clientId[0]}`);
    if (!clientId[1]) throw new Error("invalid client id");
    clientId = clientId[0];
  } catch {
    log.error("Invalid authorization header in Epic OAuth v2 request");
    return error.createError(
      "errors.com.epicgames.common.oauth.invalid_client",
      "It appears that your Authorization header may be invalid or not present, please verify that you are sending the correct headers.",
      [],
      1011,
      "invalid_client",
      400,
      res
    );
  }
  if (!req.body.refresh_token) {
    log.error("Missing refresh token in Epic OAuth v2 request");
    return error.createError(
      "errors.com.epicgames.common.oauth.invalid_request",
      "Refresh token is required.",
      [],
      1013,
      "invalid_request",
      400,
      res
    );
  }
  const refresh_token = req.body.refresh_token;
  let refreshToken = global.refreshTokens.findIndex(
    (i) => i.token == refresh_token
  );
  let object = global.refreshTokens[refreshToken];
  try {
    if (refreshToken == -1) throw new Error("Refresh token invalid.");
    let decodedRefreshToken = jwt.decode(refresh_token.replace("eg1~", ""));
    if (
      DateAddHours(
        new Date(decodedRefreshToken.creation_date),
        decodedRefreshToken.hours_expire
      ).getTime() <= new Date().getTime()
    ) {
      throw new Error("Expired refresh token.");
    }
    log.debug(`Valid Epic OAuth v2 refresh token for accountId: ${object.accountId}`);
  } catch {
    if (refreshToken != -1) {
      global.refreshTokens.splice(refreshToken, 1);
      functions.UpdateTokens();
      log.debug(`Removed invalid/expired Epic OAuth v2 refresh token: ${refresh_token}`);
    }
    log.error(`Invalid or expired Epic OAuth v2 refresh token: ${refresh_token}`);
    error.createError(
      "errors.com.epicgames.account.auth_token.invalid_refresh_token",
      `Sorry the refresh token '${refresh_token}' is invalid`,
      [refresh_token],
      18036,
      "invalid_grant",
      400,
      res
    );
    return;
  }
  req.user = await User.findOne({ accountId: object.accountId }).lean();
  log.info(`Epic OAuth v2 token issued for accountId: ${req.user.accountId}`);
  res.json({
    scope: req.body.scope || "basic_profile friends_list openid presence",
    token_type: "bearer",
    access_token: "Helixtoken",
    refresh_token: "Helixrefreshtoken",
    id_token: "Helixidtoken",
    expires_in: 7200,
    expires_at: "9999-12-31T23:59:59.999Z",
    refresh_expires_in: 28800,
    refresh_expires_at: "9999-12-31T23:59:59.999Z",
    account_id: req.user.accountId,
    client_id: clientId,
    application_id: "Helixappid",
    selected_account_id: req.user.accountId,
    merged_accounts: [],
  });
});

export function DateAddHours(pdate, number) {
  let date = pdate;
  date.setHours(date.getHours() + number);
  return date;
}

export default app;
//# sourceMappingURL=auth.js.map
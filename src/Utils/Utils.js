import axios from "axios";
import Safety from "./safety.js";

export async function SendEmptyGift(username, accountId) {
  axios.post(
    `http://127.0.0.1:${Safety.env.PORT}/fortnite/api/game/v3/profile/*/client/emptygift`,
    {
      offerId: "e406693aa12adbc8b04ba7e6409c8ab3d598e8c3",
      currency: "MtxCurrency",
      currencySubType: "",
      expectedTotalPrice: "0",
      gameContext: "",
      receiverAccountIds: [accountId],
      giftWrapTemplateId: "GiftBox:gb_makegood",
      personalMessage: "Your personal message here",
      accountId: accountId,
      playerName: username,
    }
  );
}

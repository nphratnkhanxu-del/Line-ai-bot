require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==========================
// LINE CONFIG
// ==========================
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const middleware = line.middleware(lineConfig);

// ==========================
// GEMINI CONFIG
// ==========================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction:
    "คุณเป็นผู้ช่วย AI ภาษาไทย ตอบสั้น กระชับ สุภาพ เข้าใจง่าย ถ้าผู้ใช้ถามภาษาอื่นให้ตอบภาษานั้น",
});

// ==========================
// CHAT MEMORY
// ==========================
const chatHistory = new Map();

const MAX_HISTORY_MESSAGES = 4;
const MAX_INPUT_LENGTH = 1000;

// ==========================
// Helper: sleep
// ==========================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================
// Helper: extract retryDelay (seconds) from Gemini 429 error
// ==========================
function getRetryDelaySeconds(err, fallback = 30) {
  try {
    const details = err.errorDetails || [];
    const retryInfo = details.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
    );
    if (retryInfo && retryInfo.retryDelay) {
      // retryDelay looks like "58s"
      const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''));
      if (!isNaN(seconds)) return Math.ceil(seconds);
    }
  } catch (e) {
    // ignore parsing errors, use fallback
  }
  return fallback;
}

// ==========================
// Core Gemini call (NO blocking sleep here anymore)
// ==========================
async function askGeminiOnce(userId, message) {
  const history = chatHistory.get(userId) || [];

  const chat = model.startChat({ history });

  const result = await chat.sendMessage(message);
  const text = result.response.text();

  const updatedHistory = await chat.getHistory();
  chatHistory.set(userId, updatedHistory.slice(-MAX_HISTORY_MESSAGES));

  return text || "ขออภัย ไม่สามารถตอบได้";
}

// ==========================
// Background retry + push message
// Used when the first attempt fails with 429
// ==========================
async function retryInBackgroundAndPush(userId, message) {
  try {
    // small buffer added on top of Google's suggested retryDelay
    await sleep(5000);

    const text = await askGeminiOnce(userId, message);

    await client.pushMessage({
      to: userId,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("Background retry failed:", err);

    // Only push a failure message if it's still failing after retry
    try {
      await client.pushMessage({
        to: userId,
        messages: [{
          type: "text",
          text: "ขออภัย ระบบ AI ยังไม่พร้อมใช้งานในตอนนี้ กรุณาลองใหม่อีกครั้งภายหลัง 🙏",
        }],
      });
    } catch (pushErr) {
      console.error("Push message also failed:", pushErr);
    }
  }
}

// ==========================
// Main event handler
// ==========================
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId || "unknown";
  const userMessage = event.message.text.substring(0, MAX_INPUT_LENGTH);

  let replyText;
  let needsBackgroundRetry = false;
  let retryDelaySeconds = 30;

  try {
    replyText = await askGeminiOnce(userId, userMessage);
  } catch (err) {
    console.error(err);

    if (err.status === 429) {
      retryDelaySeconds = getRetryDelaySeconds(err, 30);
      replyText =
        "ตอนนี้ AI มีผู้ใช้งานจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง 🙏";
      needsBackgroundRetry = true;
    } else {
      replyText = "ขออภัย ระบบ AI ขัดข้องชั่วคราว";
    }
  }

  // Reply immediately so the replyToken doesn't expire (~1 min limit)
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: replyText }],
  });

  // If quota-limited, try again in the background and push the real answer later
  if (needsBackgroundRetry) {
    // fire-and-forget, do not await here (don't block the webhook response)
    retryInBackgroundAndPush(userId, userMessage);
  }

  return null;
}

// ==========================
// Express app
// ==========================
const app = express();

app.get("/", (req, res) => {
  res.send("LINE AI BOT RUNNING");
});

app.post("/webhook", middleware, async (req, res) => {
  try {
    // Respond to LINE fast; process events without blocking the HTTP response
    res.status(200).end();

    await Promise.all(req.body.events.map(handleEvent));
  } catch (err) {
    console.error(err);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server Started :", PORT);
});

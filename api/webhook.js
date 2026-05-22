import express from "express";
import axios from "axios";
import { MongoClient, ObjectId } from "mongodb";

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
const MONGO = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID;

const client = new MongoClient(MONGO);

async function getDB() {
  await client.connect();

  return {
    files: client.db("telegramBot").collection("files"),
    notes: client.db("telegramBot").collection("notes"),
    users: client.db("telegramBot").collection("users")
  };
}

async function sendMessage(chatId, text, keyboard = null) {

async function sendPhoto(chat_id, photo, caption, reply_markup = {}) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        chat_id,
        photo,
        caption,
        parse_mode: "HTML",
        reply_markup
      }
    );
  } catch (err) {
    console.error("sendPhoto Error:", err.response?.data || err.message);
  }
}

  const payload = {
    chat_id: chatId,
    text
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    payload
  );
}

app.get("/", (req, res) => {
  res.send("Bot Running");
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const db = await getDB();

    if (body.message) {
      const msg = body.message;

      const chatId = msg.chat.id;
      const text = msg.text || "";

      if (text.startsWith("/start")) {

        const user_name = msg.from.first_name || "User";

        const caption = `<b>Konnichiwa, ${user_name}</b> 👋\n\nI\x27m TpX Bot.`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "🔒 Close",
                callback_data: "close_start"
              }
            ]
          ]
        };

        await sendPhoto(chatId, START_IMAGE, caption, keyboard);
      }

      if (text.startsWith("/list")) {
        const files = await db.files.find({}).toArray();

        if (!files.length) {
          await sendMessage(chatId, "No files uploaded.");
        } else {
          await sendMessage(chatId, `📁 Total Files: ${files.length}`);
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 10000;

const START_IMAGE = "AgACAgUAAxkBAAMDag-aFU5GDHO_T-qMizQUe7DwDDYAAg8QaxsaunhUMzilDF26IC4BAAMCAAN3AAM7BA";


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

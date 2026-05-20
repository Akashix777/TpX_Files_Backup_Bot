import axios from "axios";
import { MongoClient, ObjectId } from "mongodb";

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

async function sendDocument(chatId, fileId, caption = "") {
  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendDocument`,
    {
      chat_id: chatId,
      document: fileId,
      caption
    }
  );
}

function fileButtons(files) {
  return {
    inline_keyboard: files.map(file => [
      {
        text: file.name,
        callback_data: `file_${file._id}`
      }
    ])
  };
}

export default async function handler(req, res) {
  try {
    const body = req.body;

    const db = await getDB();

    if (body.callback_query) {
      const query = body.callback_query;

      const chatId = query.message.chat.id;
      const data = query.data;

      if (data.startsWith("file_")) {
        const id = data.replace("file_", "");

        const file = await db.files.findOne({
          _id: new ObjectId(id)
        });

        if (!file) {
          return res.status(200).send("ok");
        }

        await sendDocument(chatId, file.fileId, file.name);

        return res.status(200).send("ok");
      }
    }

    if (body.message) {
      const msg = body.message;

      const chatId = msg.chat.id;
      const userId = String(msg.from.id);

      const text = msg.text || "";

      await db.users.updateOne(
        { userId },
        {
          $set: {
            userId,
            username: msg.from.username || "",
            firstName: msg.from.first_name || "",
            lastName: msg.from.last_name || "",
            profile: msg.from.username
              ? `https://t.me/${msg.from.username}`
              : "No Username"
          }
        },
        {
          upsert: true
        }
      );

      if (text.startsWith("/start")) {
        await sendMessage(
          chatId,
          `📦 Welcome to TpX Files Backup Bot

Commands:

/list - Show all files
/search keyword - Search files
/helpfulnotes - Helpful notes

Admin:
/delete
/addnote
/admin`,
          {
            keyboard: [
              [{ text: "/list" }],
              [{ text: "/helpfulnotes" }]
            ],
            resize_keyboard: true
          }
        );

        return res.status(200).send("ok");
      }

      if (text.startsWith("/list")) {
        const files = await db.files.find({}).toArray();

        if (!files.length) {
          await sendMessage(chatId, "No files uploaded.");
          return res.status(200).send("ok");
        }

        await sendMessage(
          chatId,
          "📁 Uploaded Files",
          fileButtons(files)
        );

        return res.status(200).send("ok");
      }

      if (text.startsWith("/search")) {
        const keyword = text.replace("/search", "").trim();

        if (!keyword) {
          await sendMessage(chatId, "Usage:\n/search keyword");
          return res.status(200).send("ok");
        }

        const files = await db.files.find({
          name: {
            $regex: keyword,
            $options: "i"
          }
        }).toArray();

        if (!files.length) {
          await sendMessage(chatId, "No matching files found.");
          return res.status(200).send("ok");
        }

        await sendMessage(
          chatId,
          `🔎 Results for "${keyword}"`,
          fileButtons(files)
        );

        return res.status(200).send("ok");
      }

      if (text.startsWith("/helpfulnotes")) {
        const notes = await db.notes.find({}).toArray();

        if (!notes.length) {
          await sendMessage(chatId, "No notes available.");
          return res.status(200).send("ok");
        }

        let message = "📌 Helpful Notes\n\n";

        notes.forEach(note => {
          message += `• ${note.title}\n${note.content}\n\n`;
        });

        await sendMessage(chatId, message);

        return res.status(200).send("ok");
      }

      return res.status(200).send("ok");
    }

    return res.status(200).send("ok");

  } catch (err) {
    console.log(err);
    return res.status(500).send("error");
  }
}

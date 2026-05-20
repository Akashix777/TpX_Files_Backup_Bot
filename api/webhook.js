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
  return axios.post(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      reply_markup: keyboard
    }
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

    // CALLBACK BUTTONS
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

    // MESSAGES
    if (body.message) {
      const msg = body.message;

      const chatId = msg.chat.id;
      const userId = String(msg.from.id);

      const text = msg.text || "";

      // SAVE USER
      await db.users.updateOne(
        {
          userId
        },
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

      // START
      if (text.startsWith("/start")) {
        return sendMessage(
          chatId,
          `📦 Welcome to TpX Files Backup Bot

Commands:

/list - Show all files
/search keyword - Search files
/helpfulnotes - Helpful notes

Admin:
/upload
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
        ).then(() => res.status(200).send("ok"));
      }

      // LIST
      if (text.startsWith("/list")) {
        const files = await db.files.find({}).toArray();

        if (!files.length) {
          return sendMessage(chatId, "No files uploaded.")
            .then(() => res.status(200).send("ok"));
        }

        return sendMessage(
          chatId,
          "📁 Uploaded Files",
          fileButtons(files)
        ).then(() => res.status(200).send("ok"));
      }

      // SEARCH
      if (text.startsWith("/search")) {
        const keyword = text.replace("/search", "").trim();

        if (!keyword) {
          return sendMessage(
            chatId,
            "Usage:\n/search keyword"
          ).then(() => res.status(200).send("ok"));
        }

        const files = await db.files.find({
          name: {
            $regex: keyword,
            $options: "i"
          }
        }).toArray();

        if (!files.length) {
          return sendMessage(chatId, "No matching files found.")
            .then(() => res.status(200).send("ok"));
        }

        return sendMessage(
          chatId,
          `🔎 Results for "${keyword}"`,
          fileButtons(files)
        ).then(() => res.status(200).send("ok"));
      }

      // HELPFUL NOTES
      if (text.startsWith("/helpfulnotes")) {
        const notes = await db.notes.find({}).toArray();

        if (!notes.length) {
          return sendMessage(chatId, "No notes available.")
            .then(() => res.status(200).send("ok"));
        }

        let message = "📌 Helpful Notes\n\n";

        notes.forEach(note => {
          message += `• ${note.title}\n${note.content}\n\n`;
        });

        return sendMessage(chatId, message)
          .then(() => res.status(200).send("ok"));
      }

      // ADD NOTE
      if (text.startsWith("/addnote")) {
        if (userId !== ADMIN_ID) {
          return sendMessage(chatId, "❌ Admin only")
            .then(() => res.status(200).send("ok"));
        }

        const data = text.replace("/addnote", "").trim();

        if (!data.includes("|")) {
          return sendMessage(
            chatId,
            "Usage:\n/addnote title | content"
          ).then(() => res.status(200).send("ok"));
        }

        const split = data.split("|");

        const title = split[0].trim();
        const content = split[1].trim();

        await db.notes.insertOne({
          title,
          content
        });

        return sendMessage(chatId, `✅ Note added:\n${title}`)
          .then(() => res.status(200).send("ok"));
      }

      // ADMIN PANEL
      if (text.startsWith("/admin")) {
        if (userId !== ADMIN_ID) {
          return sendMessage(chatId, "❌ Admin only")
            .then(() => res.status(200).send("ok"));
        }

        const users = await db.users.find({}).toArray();

        let message = `👑 Admin Panel\n\n`;
        message += `👥 Total Users: ${users.length}\n\n`;

        users.forEach(user => {
          message += `• ${user.firstName}\n`;
          message += `ID: ${user.userId}\n`;
          message += `@${user.username || "NoUsername"}\n`;
          message += `${user.profile}\n\n`;
        });

        return sendMessage(chatId, message)
          .then(() => res.status(200).send("ok"));
      }

      // DELETE
      if (text.startsWith("/delete")) {
        if (userId !== ADMIN_ID) {
          return sendMessage(chatId, "❌ Admin only")
            .then(() => res.status(200).send("ok"));
        }

        const filename = text.replace("/delete", "").trim();

        if (!filename) {
          return sendMessage(
            chatId,
            "Usage:\n/delete filename"
          ).then(() => res.status(200).send("ok"));
        }

        const result = await db.files.deleteOne({
          name: filename
        });

        if (result.deletedCount === 0) {
          return sendMessage(chatId, "File not found.")
            .then(() => res.status(200).send("ok"));
        }

        return sendMessage(chatId, `🗑 Deleted ${filename}`)
          .then(() => res.status(200).send("ok"));
      }

      // FILE UPLOAD
      if (msg.document) {
        if (userId !== ADMIN_ID) {
          return sendMessage(chatId, "❌ Only admin can upload")
            .then(() => res.status(200).send("ok"));
        }

        const doc = msg.document;

        await db.files.insertOne({
          name: doc.file_name,
          fileId: doc.file_id
        });

        return sendMessage(
          chatId,
          `✅ Uploaded:\n${doc.file_name}`
        ).then(() => res.status(200).send("ok"));
      }
    }

    return res.status(200).send("ok");

  } catch (err) {
    console.log(err);

    return res.status(500).send("error");
  }
}

const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require("baileys");
const { Boom } = require("@hapi/boom");
const P = require("pino");

const { state, saveState } = useSingleFileAuthState('./auth_info.json');

const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
  logger: P({ level: "silent" })
});

sock.ev.on("creds.update", saveState);

// List kata spam & toxic
const spamKeywords = ["http://", "https://", "promo", "join grup", "klik link"];
const toxicKeywords = [
  "bodoh", "tolol", "anjing", "bangsat", "goblok", "idiot", "brengsek",
  "kontol", "memek", "ngentot", "cupu", "cacat", "babi", "anjir",
  "sinting", "tol", "asu", "plg", "bacot", "tai"
];

const strikeMap = {};

// Cek pesan masuk
sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  if (!msg.message || !msg.key.remoteJid.endsWith("@g.us")) return;

  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
  const lowerText = text.toLowerCase();
  const sender = msg.key.participant || msg.key.remoteJid;

  const metadata = await sock.groupMetadata(msg.key.remoteJid);
  const isAdmin = metadata.participants.find(p => p.id === sender && p.admin);

  // Deteksi spam
  const isSpam = spamKeywords.some(word => lowerText.includes(word));
  if (isSpam && !isAdmin) {
    await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], "remove");
    await sock.sendMessage(msg.key.remoteJid, {
      text: `@${sender.split("@")[0]} dikeluarkan karena spam.`,
      mentions: [sender]
    });
    return;
  }

  // Deteksi toxic
  const isToxic = toxicKeywords.some(word => lowerText.includes(word));
  if (isToxic && !isAdmin) {
    strikeMap[sender] = (strikeMap[sender] || 0) + 1;
    if (strikeMap[sender] >= 3) {
      await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], "remove");
      await sock.sendMessage(msg.key.remoteJid, {
        text: `@${sender.split("@")[0]} dikeluarkan karena toxic 3x.`,
        mentions: [sender]
      });
      delete strikeMap[sender];
    } else {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `@${sender.split("@")[0]} jangan toxic ya! Strike ${strikeMap[sender]}/3`,
        mentions: [sender]
      });
    }
  }
});
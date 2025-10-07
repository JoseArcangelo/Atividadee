// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { genai, fileManager } from './gemini-client.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------
// CONFIGURAÇÃO DE UPLOAD
// ---------------------
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const isImage = (file.mimetype || '').startsWith('image/');
    const isAudio = (file.mimetype || '').startsWith('audio/');
    if (isImage || isAudio) cb(null, true);
    else cb(new Error('Envie uma imagem ou áudio válido.'));
  },
});

// -----------------------------
// ROTA 1 — CHAT SOMENTE TEXTO
// -----------------------------
app.post('/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Campo "prompt" é obrigatório' });
    }

    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const resp = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const replyText = resp.response.text();
    return res.json({ reply: replyText });
  } catch (err) {
    console.error('Erro /chat:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// -----------------------------------
// ROTA 2 — CHAT COM IMAGEM + TEXTO
// -----------------------------------
app.post('/chat-image', upload.single('image'), async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'Campo "image" é obrigatório' });
    }

    const imgPath = path.resolve(req.file.path);
    const imgBuf = await fs.readFile(imgPath);
    const mimeType = req.file.mimetype;
    await fs.unlink(imgPath).catch(() => {});

    const base64 = imgBuf.toString('base64');
    const contents = [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt || '' },
        ],
        role: 'user',
      },
    ];

    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const resp = await model.generateContent({ contents });
    const replyText = resp.response.text();

    return res.json({ reply: replyText });
  } catch (err) {
    console.error('Erro /chat-image:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// -----------------------------
// ROTA 3 — ÁUDIO → TEXTO
// -----------------------------
app.post('/chat-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Campo "audio" é obrigatório' });
    }

    const audioPath = path.resolve(req.file.path);
    const audioBuf = await fs.readFile(audioPath);
    const mimeType = req.file.mimetype;
    await fs.unlink(audioPath).catch(() => {});

    const base64 = audioBuf.toString('base64');
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const contents = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: 'Transcreva o conteúdo deste áudio.' },
        ],
      },
    ];

    const resp = await model.generateContent({ contents });
    const replyText = resp.response.text();

    return res.json({ text: replyText });
  } catch (err) {
    console.error('Erro /chat-audio:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// -----------------------------
// ROTA 4 — TEXTO → ÁUDIO (simulado)
// -----------------------------
app.post('/chat-tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Campo "text" é obrigatório' });
    }

    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const resp = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text }] }],
    });

    const reply = resp.response.text();

    // Aqui seria integrado com API real de TTS (Google Cloud, ElevenLabs, etc.)
    const fakeAudioBase64 = Buffer.from('Áudio simulado').toString('base64');

    return res.json({ audioBase64: fakeAudioBase64, text: reply });
  } catch (err) {
    console.error('Erro /chat-tts:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// -----------------------------
// INICIALIZAÇÃO DO SERVIDOR
// -----------------------------
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Backend rodando em http://localhost:${port}`);
});

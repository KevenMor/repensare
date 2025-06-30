const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');

const app = express();
const upload = multer({ dest: os.tmpdir() });

// Configuração Firebase Storage usando arquivo de credenciais
const storage = new Storage({
  keyFilename: path.join(__dirname, 'config', 'firebase-service-account.json'),
  projectId: 'grupo-thermas-a99fc',
});
const bucket = storage.bucket('grupo-thermas-a99fc.firebasestorage.app');

app.use(cors({ origin: '*' }));

app.post('/convert-audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const inputPath = req.file.path;
    const outputName = `audio_${Date.now()}.mp3`;
    const outputPath = path.join(os.tmpdir(), outputName);

    // Conversão para MP3
    await new Promise((resolve, reject) => {
      ffmpeg()
        .setFfmpegPath(ffmpegPath)
        .input(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .audioChannels(1)
        .audioFrequency(22050)
        .outputOptions('-y')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Upload para Firebase Storage
    const destFileName = `chats/audio/${outputName}`;
    await bucket.upload(outputPath, {
      destination: destFileName,
      metadata: {
        contentType: 'audio/mpeg',
        metadata: {
          originalFileName: req.file.originalname,
        },
      },
      public: true,
    });
    const file = bucket.file(destFileName);
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 });

    // Limpeza
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    res.json({ success: true, url });
  } catch (error) {
    console.error('Erro na conversão/upload:', error);
    res.status(500).json({ error: 'Falha ao converter/upload áudio', details: error.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Audio Converter Service rodando na porta ${PORT}`);
}); 
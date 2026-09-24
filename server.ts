import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '90c00ece591542ace592ddf3736ce4e1';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // API endpoint for uploading thumbnail to ImgBB securely from server
  app.post('/api/upload-thumbnail', async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'No image data provided' });
      }

      // Clean base64 string
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const formData = new URLSearchParams();
      formData.append('key', IMGBB_API_KEY);
      formData.append('image', base64Data);

      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!data.success) {
        return res.status(500).json({ error: data.error?.message || 'ImgBB upload failed' });
      }

      return res.json({
        success: true,
        url: data.data.url,
        display_url: data.data.display_url,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Vite middleware for frontend development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// src/pages/api/delete.js
import { deleteImage } from '@/lib/cloudinary';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    try {
      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ message: 'No image URL provided' });
      }

      await deleteImage(imageUrl);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}

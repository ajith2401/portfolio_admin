import Image from 'next/image';
import { useState } from 'react';

const ImageUpload = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const uploadImage = async () => {
    if (!selectedFile) return;

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const res = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        setUploadedImageUrls(data.imageUrls);
      } else {
        console.error('Upload failed:', data.message);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteImage = async (imageUrl) => {
    if (!imageUrl) return;

    try {
      const res = await fetch('/api/delete-image', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ imageUrl })
      });

      const data = await res.json();

      if (data.success) {
        setUploadedImageUrls(null);
      } else {
        console.error('Delete failed:', data.message);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={uploadImage} disabled={loading}>
        {loading ? 'Uploading...' : 'Upload Image'}
      </button>

      {uploadedImageUrls && (
        <div>
          <h3>Uploaded Image:</h3>
          <Image src={uploadedImageUrls.small} alt="Uploaded Image" />
          <button onClick={() => deleteImage(uploadedImageUrls.original)}>
            Delete Image
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;

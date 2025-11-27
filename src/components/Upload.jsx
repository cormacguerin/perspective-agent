import React, { useState } from "react";
import axios from "axios";

const Upload = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("file", file);

    try {
      await axios.post("/api/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      alert("File uploaded successfully");
    } catch (error) {
      console.error("Error uploading file", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
      <div className="card bg-gray-800 p-6 rounded shadow-lg w-full md:w-1/2">
        <h2 className="text-2xl text-white mb-4">Upload Media</h2>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input input-bordered w-full mb-4"
        />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="textarea textarea-bordered w-full mb-4"
        ></textarea>
        <input
          type="file"
          onChange={handleFileChange}
          className="file-input file-input-bordered w-full mb-4"
        />
        {preview && <img src={preview} alt="Preview" className="w-full mb-4" />}
        <button onClick={handleUpload} className="btn btn-primary w-full">
          Upload
        </button>
      </div>
    </div>
  );
};

export default Upload;

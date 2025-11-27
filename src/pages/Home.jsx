import React from "react";

const Home = () => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="card shadow-lg compact bg-base-200">
        <div className="card-body">
          <h1 className="card-title text-4xl font-bold text-white text-center">
            Welcome to the Media Uploader!
          </h1>
          <p className="text-lg text-gray-300 text-center mt-4">
            Upload your photos or videos along with metadata and preview them
            here.
          </p>
          <div className="mt-6 flex justify-center">
            <button className="btn btn-primary">Get Started</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;

// src/components/MediaQueue.jsx
import React, { useState, useEffect } from 'react';
import { Trash2, Loader2, AlertCircle } from 'lucide-react';

export default function MediaQueue({
  pendingMedia = [],           // array of { id, status: 'pending'|'generating'|'ready'|'error', promptId, filename, url?, createdAt, ... }
  onRemove,                     // (id) => void
  onPlay,                       // (video) => void   ← emit to load in main player
  pollInterval = 5000,          // ms
  className = '',
}) {
  const [localMedia, setLocalMedia] = useState(pendingMedia);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, filename } or null

  // Sync with parent when new items arrive from chat/agent
  useEffect(() => {
    setLocalMedia(prev => {
      const existingIds = new Set(prev.map(v => v.id));
      const newOnes = pendingMedia.filter(v => !existingIds.has(v.id));
      return [...newOnes, ...prev];
    });
  }, [pendingMedia]);

  // Poll for status updates if you have a backend endpoint
  // (you can remove or adapt this part if polling happens elsewhere)
  if (localMedia.length === 0) return;

  useEffect(() => {

    if (localMedia.length === 0) return;

    const interval = setInterval(async () => {
      // Identify which videos actually need a status update
      const generatingVideos = localMedia.filter(v => v.status === 'generating');
      if (generatingVideos.length === 0) return;

      // Map through generating videos and fetch status for each
      const updates = await Promise.all(
        generatingVideos.map(async (video) => {
          try {
            const baseUrl = `${import.meta.env.VITE_SERVER_URL}/${import.meta.env.VITE_AGENT_INSTANCE}`;
            console.log("baseUrl",baseUrl)
            const response = await fetch(`${baseUrl}/comfy-history/${video.promptId}`);

            if (!response.ok) return null;

            const historyData = await response.json();
            const job = historyData[video.promptId];

            // Check if job is finished and has the expected output node (131)
            if (job && job.status?.completed && job.outputs?.["131"]) {
              const videoData = job.outputs["131"].gifs[0]; // VHS_VideoCombine uses 'gifs' key
              const filename = videoData.filename;

              return {
                promptId: video.promptId,
                status: 'ready',
                // Standard ComfyUI view endpoint
                url: `${baseUrl}/comfy-view?filename=${encodeURIComponent(filename)}&type=output`
              };
            }
          } catch (err) {
            console.error(`Error polling for ${video.promptId}:`, err);
          }
          return null;
        })
      );

      // Apply updates to state
      const validUpdates = updates.filter(u => u !== null);
      if (validUpdates.length > 0) {
        setLocalMedia(prev =>
          prev.map(v => {
            const update = validUpdates.find(u => u.promptId === v.promptId);
            return update ? { ...v, ...update } : v;
          })
        );
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [localMedia, pollInterval]);

  const handleDeleteClick = (video) => {
    setConfirmDelete(video);
  };

  const confirmDeleteAction = () => {
    if (confirmDelete) {
      onRemove?.(confirmDelete.id);
      setLocalMedia(prev => prev.filter(v => v.id !== confirmDelete.id));
      setConfirmDelete(null);
    }
  };

  if (localMedia.length === 0) return null;

  return (
    <>
      {/* Horizontal scrollable queue */}
      <div
        className={`
          w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl
          shadow-2xl shadow-black/50 overflow-hidden
          ${className}
        `}
      >
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-medium text-cyan-300 flex items-center gap-2">
            <span>Generating Media</span>
            {localMedia.filter(v => v.status === 'generating').length > 0 && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
          </h3>
          <span className="text-xs text-gray-500">
            {localMedia.length} item{localMedia.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex overflow-x-auto gap-4 p-4 pb-5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {localMedia.map((video) => (
            <div
              key={video.id}
              className={`
                group relative flex-shrink-0 w-44 h-28 rounded-xl overflow-hidden
                border border-white/10 transition-all duration-300
                ${video.status === 'ready'
                  ? 'hover:border-cyan-500/50 hover:shadow-cyan-500/20 cursor-pointer'
                  : 'opacity-70'}
                bg-gradient-to-br from-gray-900/80 to-black/80
              `}
              onClick={() => {
                if (video.status === 'ready' && video.url) {
                  onPlay(video);
                }
              }}
            >
              {/* Thumbnail / placeholder */}
              <div className="w-full h-full bg-gradient-to-br from-purple-900/30 to-cyan-900/20 flex items-center justify-center">
                {video.status === 'generating' && (
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                )}
                {video.status === 'ready' && video.url && (
                  <div className="text-cyan-300 text-xs font-medium">Ready – Click to play</div>
                )}
                {video.status === 'error' && (
                  <AlertCircle className="w-8 h-8 text-red-400" />
                )}
              </div>

              {/* Overlay info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Trash button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(video);
                }}
                className={`
                  absolute top-2 right-2 p-1.5 rounded-full
                  bg-black/60 hover:bg-red-900/70 text-white/70 hover:text-red-300
                  opacity-0 group-hover:opacity-100 transition-all duration-200
                  transform hover:scale-110
                `}
                title="Remove"
              >
                <Trash2 size={14} />
              </button>

              {/* Status badge */}
              <div className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm">
                {video.status === 'pending' && (
                  <span className="bg-gray-700/80 text-gray-300">Pending</span>
                )}
                {video.status === 'generating' && (
                  <span className="bg-cyan-900/80 text-cyan-300">Generating</span>
                )}
                {video.status === 'ready' && (
                  <span className="bg-green-900/80 text-green-300">Ready</span>
                )}
                {video.status === 'error' && (
                  <span className="bg-red-900/80 text-red-300">Failed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900/95 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 backdrop-blur-xl shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-3">Remove video?</h3>
            <p className="text-gray-400 mb-6">
              "{confirmDelete.filename || 'Untitled'}" will be removed from the queue.
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAction}
                className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition shadow-lg shadow-red-900/30"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

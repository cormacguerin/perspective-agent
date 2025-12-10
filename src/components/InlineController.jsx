// src/components/InlineController.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import Modal from './Modal';

export default function InlineController({ action }) {

  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [modal, setModal] = useState("");

  const [config, setConfig] = useState({
    baseAgentDescription: "",
    topics: [""],
    rules: [""],
    functions: { catchEmail: true },
    avatarVideos: {},
  });

  const getConfig = async () => {
    const token = localStorage.getItem("pai_agent_auth_token");
    console.log("token",token)

    try {
      const response = await fetch('/getConfig', {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("data",data)
      return data;
    } catch (error) {
      console.error("getConfig failed:", error);
      alert("Failed to load config");
      return null;
    }
  };

  function debounce(fn, delay) {
    let timeout = null;

    function debounced(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    }

    debounced.cancel = () => {
      clearTimeout(timeout);
      timeout = null;
    };

    return debounced;
  }

  const saveConfig = debounce(async (config) => {
    const token = localStorage.getItem("pai_agent_auth_token");

    try {
      await fetch('saveConfig', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorizationr': `Bearer ${token}`
        },
        body: JSON.stringify(config),
      });
      console.log('Config auto-saved');
    } catch (err) {
      console.error('Auto-save failed:', err);
      // Optional: show toast "saving failed, will retry..."
    }
  }, 1000);

  useEffect(() => {
    saveConfig(config);
    return () => saveConfig.cancel();
  }, [config]);

  // baseAgentDescription
  const updateDescription = (value) => {
    setConfig(cfg => ({ ...cfg, baseAgentDescription: value }));
  };

  // topics
  const updateTopic = (index, value) => {
    setConfig(cfg => ({
      ...cfg,
      topics: cfg.topics.map((t, i) => i === index ? value : t)
    }));
  };

  // rules
  const updateRule = (index, value) => {
    setConfig(cfg => ({
      ...cfg,
      rules: cfg.rules.map((r, i) => i === index ? value : r)
    }));
  };

  // avatarVideos
  const updateVideoKey = (oldKey, newKey) => {
    if (!newKey || newKey === oldKey || config.avatarVideos[newKey]) return;
    setConfig(cfg => {
      const { [oldKey]: value, ...rest } = cfg.avatarVideos;
      return { ...cfg, avatarVideos: { ...rest, [newKey]: value } };
    });
  };

  const updateVideoFile = (key, file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setConfig(cfg => ({
        ...cfg,
        avatarVideos: {
          ...cfg.avatarVideos,
          [key]: { ...cfg.avatarVideos[key], video: reader.result }
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const updateVideoDescription = (key, description) => {
    setConfig(cfg => ({
      ...cfg,
      avatarVideos: {
        ...cfg.avatarVideos,
        [key]: { ...cfg.avatarVideos[key], description }
      }
    }));
  };

  const removeVideo = (key) => {
    setConfig(cfg => {
      const { [key]: _, ...rest } = cfg.avatarVideos;
      return { ...cfg, avatarVideos: rest };
    });
  };

  const addVideo = () => {
    const newKey = `video${Object.keys(config.avatarVideos).length + 1}`;
    setConfig(cfg => ({
      ...cfg,
      avatarVideos: { ...cfg.avatarVideos, [newKey]: { video: "", description: "" } }
    }));
  };

  return (
    <>

      {action && (
        <>
          <div className="my-5 animate-in slide-in-from-left duration-500">
            {action === "ConfigActionProvider_listConfig" && (
              <button
                onClick={async () => {
                  setModal("editConfig");
                  try {
                    const configData = await getConfig();
                    console.log("button configData",configData)

                    if (configData) {
                      setConfig(configData);
                    } else {
                      alert("Config not found or access denied");
                    }
                  } catch (err) {
                    alert("Failed to load config");
                    console.error(err);
                  }
                }}
                htmlFor={`modal-${action}`}
                className="btn btn-outline border-2 border-orange-500/70 text-orange-400 hover:bg-orange-500 hover:text-black hover:border-orange-400 hover:shadow-lg hover:shadow-orange-500/50 font-bold tracking-wider text-sm uppercase transition-all duration-300 hover:scale-105"
              >
                EDIT CONFIG
              </button>
            )}
          </div>
        </>
      )}

      {modal && (
        <Modal open={modal} onClose={() => setModal("")} title="Edit Config">
          <div className="flex-row p-6 space-y-8">

            {/* baseAgentDescription */}
            <label className="form-control">
              <span className="label-text text-[#FFFFFF]">baseAgentDescription</span>
              <textarea
                className="textarea textarea-bordered bg-black/20 border-[#FFFFFF]/40 text-white h-32 mt-2"
                value={config.baseAgentDescription}
                onChange={(e) => updateDescription(e.target.value)}
                required
              />
            </label>

            {/* topics */}
            <div className="form-control">
              <span className="label-text text-[#8B5CF6]">topics</span>
              {config.topics.map((topic, i) => (
                <div key={i} className="flex gap-2 mt-2">
                  <input
                    className="input input-bordered bg-black/20 border-[#8B5CF6]/40 text-white flex-1"
                    value={topic}
                    onChange={(e) => updateTopic(i, e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setConfig(cfg => ({ ...cfg, topics: cfg.topics.filter((_, idx) => idx !== i) }))}
                    className="btn btn-square btn-error btn-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setConfig(cfg => ({ ...cfg, topics: [...cfg.topics, ""] }))}
                className="btn btn-outline btn-success btn-sm mt-2"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* rules */}
            <div className="form-control">
              <span className="label-text text-[#F87171]">rules</span>
              {config.rules.map((rule, i) => (
                <div key={i} className="flex gap-2 mt-2">
                  <input
                    className="input input-bordered bg-black/20 border-[#F87171]/40 text-white flex-1"
                    value={rule}
                    onChange={(e) => updateRule(i, e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setConfig(cfg => ({ ...cfg, rules: cfg.rules.filter((_, idx) => idx !== i) }))}
                    className="btn btn-square btn-error btn-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setConfig(cfg => ({ ...cfg, rules: [...cfg.rules, ""] }))}
                className="btn btn-outline btn-success btn-sm mt-2"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* avatarVideos */}
            <div className="form-control">
              <span className="label-text text-[#10B981]">avatarVideos</span>

              {Object.keys(config.avatarVideos).length === 0 && (
                <p className="text-gray-500 text-sm mt-2">No videos added</p>
              )}

              {Object.entries(config.avatarVideos).map(([key, data]) => (
                <div key={key} className="border border-[#10B981]/40 rounded-lg p-4 mt-4 space-y-3">
                  <input
                    className="input input-bordered bg-black/20 border-[#10B981]/40 text-white w-64"
                    value={key}
                    onChange={(e) => updateVideoKey(key, e.target.value)}
                    placeholder="key name"
                    required
                  />
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => e.target.files?.[0] && updateVideoFile(key, e.target.files[0])}
                    className="file-input file-input-bordered file-input-sm bg-black/20"
                    required
                  />
                  <input
                    className="input input-bordered bg-black/20 border-[#10B981]/40 text-white w-full"
                    value={data.description || ""}
                    onChange={(e) => updateVideoDescription(key, e.target.value)}
                    placeholder="description"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => removeVideo(key)}
                    className="btn btn-square btn-error btn-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addVideo}
                className="btn btn-outline btn-success btn-sm mt-4"
              >
                <Plus size={18} /> Add video
              </button>
            </div>

          </div>
        </Modal>
      )}
      
    </>
  );
}

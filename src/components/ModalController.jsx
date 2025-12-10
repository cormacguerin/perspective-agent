// src/components/ModalController.jsx
import { useState, useEffect } from "react";

export default function ModalController({ action, onClose }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Auto-open the dialog when action changes
  useEffect(() => {
    if (action) {
      const dialog = document.getElementById("agent_modal");
      dialog?.showModal();
    }
  }, [action]);

  if (!action) return null;

  const title =
    action
      .split("_")[1]
      ?.replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase()) || "Action";

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, args: formData }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog id="agent_modal" className="modal modal-bottom sm:modal-middle">
      <div className="modal-box bg-gray-900 border border-purple-600 max-w-3xl w-full">
        <form method="dialog">
          <button
            className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 text-gray-400"
            onClick={onClose}
          >
            X
          </button>
        </form>

        <h3 className="font-bold text-2xl text-white mb-6">{title}</h3>

        <div className="mb-8">
          {(() => {
            switch (action) {
              case "ConfigActionProvider_listConfig":
                return (
                  <label className="label cursor-pointer justify-start gap-4">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary"
                      checked={!!formData.raw}
                      onChange={(e) =>
                        setFormData({ ...formData, raw: e.target.checked })
                      }
                    />
                    <span className="label-text text-gray-300">Show raw JSON</span>
                  </label>
                );
              default:
                return <p className="text-gray-400">No parameters needed</p>;
            }
          })()}
        </div>

        <div className="modal-action">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? <span className="loading loading-spinner" /> : "Submit"}
          </button>
          <form method="dialog">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </form>
        </div>

        {result && (
          <pre className="mt-6 p-6 p-4 bg-black/50 rounded-lg text-green-400 text-sm overflow-auto max-h-96">
            {result}
          </pre>
        )}
      </div>

      {/* Click outside = close */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

// FadeAvatarVideo.jsx
import { useEffect, useRef, useState } from "react";

export default function FadeAvatarVideo({ newVideo, videoSources }) {
  const videoA = useRef(null);
  const videoB = useRef(null);
  const active = useRef("A"); // which video is currently visible
  const queue = useRef([]);

  const [currentSrc, setCurrentSrc] = useState("");

  // pick random idle
  const pickIdle = () => {
    const idleKeys = Object.keys(videoSources).filter(
      (k) => videoSources[k].tag === "idle"
    );
    return idleKeys[Math.floor(Math.random() * idleKeys.length)];
  };

  const loopVideo = () => {
    console.log("loopVideo A")
    let nextKey;

    if (queue.current.length > 0) {
      nextKey = queue.current.shift();
    } else {
      nextKey = pickIdle();
    }
    console.log("loopVideo B")

    const src = videoSources[nextKey]?.path;
    if (src) setCurrentSrc(src);
  };

  const fadeInVideo = async (nextSrc) => {
    const oldVid = active.current === "A" ? videoA.current : videoB.current;
    const newVid = active.current === "A" ? videoB.current : videoA.current;

    newVid.style.transition = "";      // reset
    newVid.style.opacity = 0;          // start invisible
    newVid.src = nextSrc;
    newVid.load();

    const playNext = () => {
      console.log("playNext",queue.current)
      newVid.onended = () => loopVideo();

      newVid.play();

      // fade
      requestAnimationFrame(() => {
        newVid.style.transition = "opacity 300ms ease-in";
        newVid.style.opacity = 1;
      });

      // After fade completes → swap active video
      setTimeout(() => {
        oldVid.pause();
        active.current = active.current === "A" ? "B" : "A";
      }, 300);
    };

    newVid.addEventListener("canplaythrough", playNext, { once: true });
  };

  // listen for end on the active video only
  useEffect(() => {
    const handler = () => loopVideo();

    if (videoA.current) videoA.current.addEventListener("ended", handler);
    if (videoB.current) videoB.current.addEventListener("ended", handler);

    return () => {
      if (videoA.current) videoA.current.removeEventListener("ended", handler);
      if (videoB.current) videoB.current.removeEventListener("ended", handler);
    };
  }, []); // mount once

  // when currentSrc changes → fade it in
  useEffect(() => {
    if (currentSrc) fadeInVideo(currentSrc);
  }, [currentSrc]);

  // new video from parent
  useEffect(() => {
    if (newVideo?.name && videoSources[newVideo.name]) {
      queue.current.push(newVideo.name);
      if (!currentSrc || queue.current.length === 1) loopVideo();
    }
  }, [newVideo, videoSources]);

  // initial start
  useEffect(() => {
    if (!currentSrc) loopVideo();
  }, []);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gray-900/50">
      {/* bottom layer (old video) */}
      <video
        ref={videoA}
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 1 }}
      />

      {/* top layer (new video) */}
      <video
        ref={videoB}
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0 }}
      />
    </div>
  );
}


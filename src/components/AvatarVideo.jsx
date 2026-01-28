import { useEffect, useRef, useState } from "react";

export default function AvatarVideo({ context }) {
  const videoA = useRef(null);
  const videoB = useRef(null);
  const activeRef = useRef("A");
  const queue = useRef([]);

  const [sources, setSources] = useState(null);

  // load video map
  useEffect(() => {
    fetch(`/${import.meta.env.VITE_AGENT_INSTANCE}/avatar`)
      .then(r => r.json())
      .then(setSources);
  }, []);

  const getIdle = () => {
    const keys = Object.keys(sources).filter(k => sources[k].idle);
    return keys[Math.floor(Math.random() * keys.length)];
  };

  const getTalk = () => {
    const keys = Object.keys(sources).filter(k => sources[k].talking);
    return keys[Math.floor(Math.random() * keys.length)];
  };

  const getActive = () =>
    activeRef.current === "A" ? videoA.current : videoB.current;

  const getHidden = () =>
    activeRef.current === "A" ? videoB.current : videoA.current;

  const playNext = async () => {
    if (!sources) return;

    const key = queue.current.shift() || getIdle();
    const src = sources[key]?.blob;
    if (!src) return;

    const active = getActive();
    const hidden = getHidden();

    hidden.src = src;
    hidden.currentTime = 0;
    hidden.style.opacity = 0;
    hidden.load();

    hidden.onended = playNext;
    hidden.play();

    requestAnimationFrame(() => {
      hidden.style.transition = "opacity 300ms ease";
      hidden.style.opacity = 1;
    });

    setTimeout(() => {
      active.pause();
      activeRef.current = activeRef.current === "A" ? "B" : "A";
    }, 300);
  };


  // init (react async pattern)
  useEffect(() => {
    if (sources) {
      let end=false;
      const run = async () => {

        const idleKeys = Object.keys(sources).filter(
          k => sources[k].idle
        );
        await preloadIdleVideos(idleKeys);

        const talkingKeys = Object.keys(sources).filter(
          k => sources[k].talking
        );
        await preloadIdleVideos(talkingKeys);

        playNext();

        if (!end) {
          //placeholder
        }

      };
      run();
      return()=>{
        end = true;
      }
    }
  }, [sources]);

  // emotion trigger
  useEffect(() => {

    console.log("context",context)

    if (context?.video === "talking") {

      const t = getTalk();
      console.log("t",t)
      queue.current.push(t);

    //} else if (context?.video && sources?.[context.video]) {
    } else if (context?.video) {

      let end=false;
      const run = async () => {

        console.log("queued",context.video)
        if (!sources[context.video]?.blob) {
          await preloadIdleVideos([context.video]);
        }
        queue.current.push(context.video);
        // playNext();
          //
        if (!end) {
          //placeholder
        }

      }

      run();
      return()=>{
        end = true;
      }

    }

  }, [context]);

  const preloadIdleVideos = async (srcs) => {

    const cache = {};

    console.log("preloadIdleVideos", srcs)
    // await Promise.all(
      //srcs.map(key => {
    for (var key of srcs) {
          console.log(key)
        //return new Promise(async resolve => {
          const resp = await fetch(sources[key].url);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          sources[key].blob = blobUrl;
          /*
          const video = document.createElement("video");
          console.log("videokey",key)
          video.muted = true;
          video.playsInline = true;
          video.src = sources[key].url;

          video.onloadeddata = () => {
            // warm decoder
            video.play()
              .then(() => {
                setTimeout(() => {
                  video.pause();
                  video.currentTime = 0;
                  cache[key] = video;
                  resolve();
                }, 100);
              })
              .catch((e) => {
                console.log(e)
                cache[key] = video;
                resolve();
              });
          };

          video.load();
          */
        //});
      }//)
    //);

    return cache;
 
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoA}
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 1 }}
      />
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


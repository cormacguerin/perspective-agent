// agent/providers/generateVideoProvider.ts

import { ActionProvider, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import fs from "fs";
import path from "path";
import axios from 'axios';
import fetch from "node-fetch";
import FormData from 'form-data';
import { fileURLToPath } from "url";
import infiniteTalkVideoWorkflow from '../comfyui_workflows/wanvideo_2_1_14B_V2V_InfiniteTalk_API.json' with { type: 'json' };
import { v4 as uuidv4 } from 'uuid';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMFY_URL = process.env.VITE_COMFY_URL ?? "http://127.0.0.1:8188";

export class GenerateVideoProvider extends ActionProvider {

  constructor(
    private readonly authProvider: any, // injected members
    private readonly dataStoreProvider: any
  ) {
    super("generateVideo", []);
  }

  supportsNetwork = () => true;

  // ---------------------------------------------------------------------------
  // Action
  // ---------------------------------------------------------------------------
  @CreateAction({
    name: "generateVideo",
    description: "Generate a speech video using ComfyUI WanVideo InfiniteTalk using stored audio + video",
    schema: z.object({
      videoDataItemId: z.string(),
      audioDataItemId: z.string(),
      promptOverride: z.string().optional()
    })
  })
  async generateVideo(args: {
    videoDataItemId: string;
    audioDataItemId: string;
    promptOverride?: string;
  }): Promise<string> {

    // -----------------------------------------------------------------------
    // 1. Resolve datastore items
    // -----------------------------------------------------------------------
    const videoItem = await this.resolveDataItem(args.videoDataItemId);
    const audioItem = await this.resolveDataItem(args.audioDataItemId);
    console.log({videoItem,audioItem});

    if (!videoItem?.path || !audioItem?.path) {
      throw new Error("Missing file paths in datastore items");
    }

    const owner = await this.authProvider.getOwnerWalletAddress();

    // -----------------------------------------------------------------------
    // 2. Upload files to ComfyUI
    // -----------------------------------------------------------------------
    const uploadedVideoPath = await this.uploadToComfyUI(videoItem.path, owner);
    const uploadedAudioPath = await this.uploadToComfyUI(audioItem.path, owner);
    console.log({uploadedVideoPath,uploadedAudioPath});

    const promptId = uuidv4();

    // -----------------------------------------------------------------------
    // 3. Build workflow
    // -----------------------------------------------------------------------
    const workflow = this.buildWorkflow({
      videoFilename: uploadedVideoPath,
      audioFilename: uploadedAudioPath,
      promptId: promptId,
      promptOverride: args.promptOverride
    });

    console.log("workflow",workflow);

    // -----------------------------------------------------------------------
    // 4. Execute workflow
    // -----------------------------------------------------------------------
    const res = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow })
    });

    if (!res.ok) {
      throw new Error(`ComfyUI prompt failed: ${await res.text()}`);
    }

    const result = await res.json();

    console.log("result",result);

    return JSON.stringify({
      action: "generateVideo",
      prompt_id: promptId,
      result: result
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveDataItem(id: string): Promise<any> {
    const raw = await this.dataStoreProvider.getDataItem({ id });
    return JSON.parse(raw).data;
  }

  private async uploadToComfyUI(filePath: string, subfolder: string): Promise<string> {
    const form = new FormData();

    form.append("image", fs.createReadStream(filePath));
    form.append("type", "input");
    form.append("subfolder", subfolder);

    try {
      const res = await axios.post(`${COMFY_URL}/upload/image`, form, {
        headers: {
          ...form.getHeaders(),
        },
        maxRedirects: 5,
      });
      //console.log("res",res)

      const data = res.data;
      console.log("Upload success:", data);

      // Return the filename as ComfyUI sees it (important!)
      // return data.name || '';
      return data.subfolder
        ? `${data.subfolder}/${data.name}`
        : data.name;

    } catch (e) {
      console.error("Upload failed:", e);
      if (axios.isAxiosError(e) && e.response) {
        console.log("Status:", e.response.status, "Body:", await e.response.data);
      }
      return "";
    }

  }

  // ---------------------------------------------------------------------------
  // Workflow patcher
  // ---------------------------------------------------------------------------
  private buildWorkflow(opts: {
    videoFilename: string;
    audioFilename: string;
    promptId: string;
    promptOverride?: string;
  }): Record<string, any> {

    // IMPORTANT:
    // These node IDs match your WanVideo InfiniteTalk JSON
    // 125 = LoadAudio
    // 228 = VHS_LoadVideo
    // 241 = WanVideoTextEncodeCached

    //const workflowPath = path.join(__dirname, "../comfyui_workflows/wanvideo_2_1_14B_V2V_InfiniteTalk_API.json");
    //const workflowJson = fs.readFileSync(workflowPath, "utf-8");
    //const workflow = JSON.parse(workflowJson);
    //const workflow = JSON.parse(infiniteTalkVideoWorkflow);
    const workflow = infiniteTalkVideoWorkflow;

    workflow["122"].inputs.model = "wan2.1-i2v-14b-480p-Q4_K_M.gguf";
    workflow["125"].inputs.audio = opts.audioFilename;
    workflow["228"].inputs.video = opts.videoFilename;
    workflow["131"].inputs.save_output = true;
    workflow["131"].inputs.filename_prefix = `pov_${opts.promptId}_`;

    if (opts.promptOverride) {
      workflow["241"].inputs.positive_prompt = opts.promptOverride;
    }

    return workflow;
  }
}

export const generateVideoProvider = (ap: any, dp: any) => {
  return new GenerateVideoProvider(ap, dp);
};

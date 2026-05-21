import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const VISION_TASKS_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandLandmarker(delegate: "GPU" | "CPU") {
  const filesetResolver = await FilesetResolver.forVisionTasks(VISION_TASKS_WASM_URL);

  return HandLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

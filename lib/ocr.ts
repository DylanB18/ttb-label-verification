import { createScheduler, createWorker, type Scheduler, type Worker } from "tesseract.js";

export interface OcrResult {
  text: string;
  confidence: number; // 0-100, tesseract's mean word confidence
}

let sharedWorker: Promise<Worker> | null = null;

function getSharedWorker(): Promise<Worker> {
  if (!sharedWorker) {
    sharedWorker = createWorker("eng");
  }
  return sharedWorker;
}

/** Runs OCR against a single image. Reuses one long-lived worker (fine for low-concurrency single-label use). */
export async function runOcr(imageBuffer: Buffer): Promise<OcrResult> {
  const worker = await getSharedWorker();
  const { data } = await worker.recognize(imageBuffer);
  return { text: data.text, confidence: data.confidence };
}

/** A small pool of workers for running OCR over many images concurrently (batch mode). */
export class OcrPool {
  private scheduler: Scheduler;
  private workers: Worker[] = [];
  private ready: Promise<void>;

  constructor(size: number) {
    this.scheduler = createScheduler();
    this.ready = this.init(size);
  }

  private async init(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = await createWorker("eng");
      this.workers.push(worker);
      this.scheduler.addWorker(worker);
    }
  }

  async recognize(imageBuffer: Buffer): Promise<OcrResult> {
    await this.ready;
    const { data } = await this.scheduler.addJob("recognize", imageBuffer);
    return { text: data.text, confidence: data.confidence };
  }

  async terminate() {
    await this.ready;
    await this.scheduler.terminate();
  }
}

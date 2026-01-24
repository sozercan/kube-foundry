/**
 * Azure OpenAI TTS narration system
 * Generates speech from text and plays it using macOS afplay
 */

import OpenAI from 'openai';
import { $ } from 'bun';
import { config } from './config';
import { log, estimateNarrationDuration } from './utils';
import type { NarrationKey } from './script';
import { NARRATION } from './script';

let client: OpenAI | null = null;

/**
 * Initialize the Azure OpenAI client
 */
function getClient(): OpenAI {
  if (!client) {
    if (!config.azure.endpoint || !config.azure.apiKey) {
      throw new Error(
        'Azure OpenAI credentials not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables.'
      );
    }

    client = new OpenAI({
      apiKey: config.azure.apiKey,
      baseURL: `${config.azure.endpoint}/openai/deployments/${config.azure.ttsDeployment}`,
      defaultQuery: { 'api-version': '2024-05-01-preview' },
      defaultHeaders: { 'api-key': config.azure.apiKey },
    });
  }
  return client;
}

/**
 * Generate speech from text and play it
 * @param text - Text to speak
 * @param waitForCompletion - If true, wait for audio to finish playing
 */
export async function speak(text: string, waitForCompletion = true): Promise<void> {
  if (config.features.skipNarration) {
    log.narration(text);
    // Simulate narration time for pacing
    const duration = estimateNarrationDuration(text);
    await new Promise((resolve) => setTimeout(resolve, Math.min(duration, 2000)));
    return;
  }

  const openai = getClient();

  try {
    log.narration(text);

    const response = await openai.audio.speech.create({
      model: config.azure.ttsDeployment,
      voice: config.azure.ttsVoice,
      input: text,
      speed: config.azure.ttsSpeed,
      instructions: config.azure.ttsInstructions,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const tempFile = `${config.paths.tempAudio}/narration-${Date.now()}.mp3`;

    await Bun.write(tempFile, buffer);

    if (waitForCompletion) {
      // Play audio and wait for completion using sync execution
      const proc = Bun.spawnSync(['afplay', tempFile]);
      if (proc.exitCode !== 0) {
        log.warning(`afplay exited with code ${proc.exitCode}`);
      }
      // Small buffer after audio completes
      await new Promise((resolve) => setTimeout(resolve, 200));
    } else {
      // Play audio in background
      Bun.spawn(['afplay', tempFile], {
        onExit: async () => {
          // Cleanup after playback
          await $`rm ${tempFile}`.quiet();
        },
      });
      // Small delay to ensure playback starts
      await new Promise((resolve) => setTimeout(resolve, 100));
      return; // Don't cleanup temp file - background process will do it
    }

    // Cleanup if we waited
    await $`rm ${tempFile}`.quiet();
  } catch (error) {
    log.warning(`TTS failed, continuing without audio: ${error}`);
    // Continue without audio - don't block the demo
    const duration = estimateNarrationDuration(text);
    await new Promise((resolve) => setTimeout(resolve, Math.min(duration, 2000)));
  }
}

/**
 * Narrate using a predefined script key
 * @param key - Key from NARRATION object
 * @param waitForCompletion - If true, wait for audio to finish
 */
export async function narrate(key: NarrationKey, waitForCompletion = true): Promise<void> {
  const text = NARRATION[key];
  if (!text) {
    log.warning(`Narration key not found: ${key}`);
    return;
  }
  await speak(text, waitForCompletion);
}

/**
 * Check if TTS is available
 */
export async function checkTtsAvailable(): Promise<boolean> {
  if (config.features.skipNarration) {
    return true;
  }

  if (!config.azure.endpoint || !config.azure.apiKey) {
    log.warning('Azure OpenAI credentials not set. Narration will be skipped.');
    return false;
  }

  try {
    // Test with a short phrase
    const openai = getClient();
    const response = await openai.audio.speech.create({
      model: config.azure.ttsDeployment,
      voice: config.azure.ttsVoice,
      input: 'Test',
      speed: 1.0,
      instructions: config.azure.ttsInstructions,
    });

    // Just verify we got a response
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > 0;
  } catch (error) {
    log.warning(`TTS health check failed: ${error}`);
    return false;
  }
}

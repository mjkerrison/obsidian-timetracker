let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

/**
 * Play a beep sound using Web Audio API
 */
export function playBeep(frequency = 800, duration = 200, volume = 0.3): void {
	try {
		const ctx = getAudioContext();

		// Resume context if suspended (browsers require user interaction)
		if (ctx.state === "suspended") {
			ctx.resume();
		}

		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.frequency.value = frequency;
		oscillator.type = "sine";

		gainNode.gain.value = volume;
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

		oscillator.start(ctx.currentTime);
		oscillator.stop(ctx.currentTime + duration / 1000);
	} catch (error) {
		console.error("Failed to play beep:", error);
	}
}

/**
 * Play a sequence of beeps for timer completion
 */
export function playTimerComplete(): void {
	// Play three ascending beeps
	playBeep(600, 150, 0.3);
	setTimeout(() => playBeep(800, 150, 0.3), 200);
	setTimeout(() => playBeep(1000, 300, 0.3), 400);
}

/**
 * Play a gentle beep for break completion
 */
export function playBreakComplete(): void {
	// Play two soft beeps
	playBeep(500, 200, 0.2);
	setTimeout(() => playBeep(600, 200, 0.2), 250);
}

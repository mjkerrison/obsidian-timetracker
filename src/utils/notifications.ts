/**
 * Show a system notification using the Notification API
 */
export function showNotification(title: string, body: string): void {
	// Check if notifications are supported
	if (!("Notification" in window)) {
		console.warn("Notifications not supported");
		return;
	}

	// Check permission
	if (Notification.permission === "granted") {
		createNotification(title, body);
	} else if (Notification.permission !== "denied") {
		Notification.requestPermission().then((permission) => {
			if (permission === "granted") {
				createNotification(title, body);
			}
		});
	}
}

function createNotification(title: string, body: string): void {
	try {
		const notification = new Notification(title, {
			body,
			icon: "timer",
			silent: true, // We handle sound separately
		});

		// Auto-close after 5 seconds
		setTimeout(() => notification.close(), 5000);
	} catch (error) {
		console.error("Failed to show notification:", error);
	}
}

/**
 * Request notification permission (call on user interaction)
 */
export async function requestNotificationPermission(): Promise<boolean> {
	if (!("Notification" in window)) {
		return false;
	}

	if (Notification.permission === "granted") {
		return true;
	}

	if (Notification.permission === "denied") {
		return false;
	}

	const permission = await Notification.requestPermission();
	return permission === "granted";
}

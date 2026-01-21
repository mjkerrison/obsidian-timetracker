/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Format a Date object to HH:MM string
 */
export function formatTime(date: Date): string {
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
}

/**
 * Parse YYYY-MM-DD string to Date object (at midnight local time)
 */
export function parseDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split("-").map(Number);
	return new Date(year, month - 1, day);
}

/**
 * Parse HH:MM string to minutes since midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:MM string
 */
export function minutesToTime(minutes: number): string {
	const hours = Math.floor(minutes / 60) % 24;
	const mins = minutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Get the start of the week containing the given date
 */
export function getWeekStart(date: Date, weekStartDay: 0 | 1): Date {
	const d = new Date(date);
	const day = d.getDay();
	// Calculate days to subtract to get to week start
	const diff = (day - weekStartDay + 7) % 7;
	d.setDate(d.getDate() - diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Get array of 7 dates for the week containing the given date (calendar-week aligned)
 */
export function getWeekDates(date: Date, weekStartDay: 0 | 1): Date[] {
	const start = getWeekStart(date, weekStartDay);
	const dates: Date[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		dates.push(d);
	}
	return dates;
}

/**
 * Get array of 7 consecutive dates starting from the given date (sliding window)
 */
export function get7DaysFrom(date: Date): Date[] {
	const dates: Date[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(date);
		d.setDate(date.getDate() + i);
		d.setHours(0, 0, 0, 0);
		dates.push(d);
	}
	return dates;
}

/**
 * Convert slot index (0-95) to time string (15-min granularity)
 */
export function slotToTime(slot: number): string {
	const minutes = slot * 15;
	return minutesToTime(minutes);
}

/**
 * Convert time string to slot index (0-95)
 */
export function timeToSlot(timeStr: string): number {
	const minutes = parseTimeToMinutes(timeStr);
	return Math.floor(minutes / 15);
}

/**
 * Round minutes to nearest 15-minute slot
 */
export function roundToSlot(minutes: number): number {
	return Math.round(minutes / 15) * 15;
}

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) {
		return `${mins}m`;
	}
	if (mins === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${mins}m`;
}

/**
 * Format seconds to MM:SS or HH:MM:SS string
 */
export function formatSeconds(seconds: number): string {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hrs > 0) {
		return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
	}
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Check if two date strings represent the same day
 */
export function isSameDay(date1: string, date2: string): boolean {
	return date1 === date2;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getToday(): string {
	return formatDate(new Date());
}

/**
 * Generate a unique ID for entries
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Get day name abbreviation
 */
export function getDayName(date: Date, short = true): string {
	const days = short
		? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
		: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	return days[date.getDay()];
}

/**
 * Get month name
 */
export function getMonthName(date: Date, short = true): string {
	const months = short
		? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	return months[date.getMonth()];
}

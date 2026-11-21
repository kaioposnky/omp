import type { Job } from "./data";

export function renderTable(jobs: Job[]): string {
	const header = "ID    NAME     STATUS   SCORE";
	const rows = jobs.map(job => {
		const name = job.name.padEnd(8);
		const status = job.status.padEnd(8);
		const score = String(job.score).padStart(5);
		return `${job.id} ${name} ${status} ${score}`;
	});
	return [header, ...rows].join("\n");
}

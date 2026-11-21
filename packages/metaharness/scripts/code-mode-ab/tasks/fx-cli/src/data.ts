export interface Job {
	id: string;
	name: string;
	status: "queued" | "running" | "done";
	score: number;
}

export const jobs: Job[] = [
	{ id: "j-01", name: "ingest", status: "done", score: 91 },
	{ id: "j-02", name: "index", status: "running", score: 74 },
	{ id: "j-03", name: "compact", status: "queued", score: 12 },
	{ id: "j-04", name: "export", status: "done", score: 88 },
	{ id: "j-05", name: "verify", status: "queued", score: 33 },
];

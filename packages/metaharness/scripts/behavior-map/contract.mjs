// Runs inside the validation sandbox after ./start.sh: probes the API contract of
// TASK-complex.md and drives the UI in headless Chrome. Scoring happens on the host.
// Usage: node contract.mjs <puppeteer-core dir> <out dir> <wait seconds>
import { createRequire } from "node:module";
import * as fs from "node:fs";

const [moduleDir, outDir, waitSeconds] = process.argv.slice(2);
const puppeteer = createRequire(moduleDir + "/")("puppeteer-core");
const ROOTS = ["http://localhost:4321", "http://127.0.0.1:4321", "http://[::1]:4321"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const out = { ready: false, api: {}, ui: {} };

const get = async (root, path) => {
	try {
		const res = await fetch(root + path, { signal: AbortSignal.timeout(20_000) });
		const text = await res.text();
		let json = null;
		try { json = JSON.parse(text); } catch {}
		return { status: res.status, type: res.headers.get("content-type") ?? "", json, text: json ? undefined : text.slice(0, 200_000) };
	} catch (error) {
		return { status: null, error: String(error).slice(0, 200) };
	}
};

let root = null;
const started = Date.now();
while (!root && Date.now() - started < Number(waitSeconds) * 1000) {
	for (const candidate of ROOTS) {
		const r = await get(candidate, "/");
		if (r.status !== null && r.status < 500) { root = candidate; break; }
	}
	if (!root) await sleep(2000);
}
out.readySeconds = Math.round((Date.now() - started) / 1000);
if (root) {
	out.ready = true;
	out.root = root;
	const paths = {
		dash0: "/api/dashboard?days=0", dash7: "/api/dashboard?days=7", dash30: "/api/dashboard?days=30",
		s_cost5: "/api/sessions?days=0&sort=cost&limit=5", s_tok3: "/api/sessions?days=30&sort=tokens&limit=3", s_default7: "/api/sessions?days=7",
		e_sort: "/api/sessions?sort=bogus", e_limit0: "/api/sessions?limit=0", e_limit500: "/api/sessions?limit=500", e_days: "/api/sessions?days=-1",
		csv0: "/api/export.csv?days=0", csv7: "/api/export.csv?days=7",
	};
	for (const [key, path] of Object.entries(paths)) out.api[key] = await get(root, path);

	const browser = await puppeteer.launch({
		executablePath: "/usr/bin/google-chrome", headless: true,
		args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--window-size=1440,1000"],
	});
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 1000 });
	const requests = [];
	page.on("request", req => { if (req.url().includes("/api/")) requests.push(req.url()); });
	const errors = [];
	page.on("pageerror", e => errors.push(String(e).slice(0, 300)));

	// Bug 1: a period button must trigger a new dashboard request for that period.
	try {
		// One retry: a cold first load (WebGL, large bundles) can miss the idle window once.
		await page.goto(root + "/", { waitUntil: "networkidle2", timeout: 60_000 }).catch(() =>
			page.goto(root + "/", { waitUntil: "networkidle2", timeout: 60_000 }),
		);
		await sleep(3000);
		const before = requests.length;
		out.ui.periodClicked = await page.evaluate(() => {
			const control = [...document.querySelectorAll("button,[role=tab],[role=radio],a,label")].find(el => /^7\s*(dias|d|days)$/i.test((el.innerText ?? "").trim()));
			if (control) { control.click(); return control.innerText.trim(); }
			const select = [...document.querySelectorAll("select")].find(s => [...s.options].some(o => /^7\s*(dias|d|days)$/i.test(o.text.trim())));
			if (select) {
				const option = [...select.options].find(o => /^7\s*(dias|d|days)$/i.test(o.text.trim()));
				select.value = option.value;
				select.dispatchEvent(new Event("change", { bubbles: true }));
				return "select:" + option.text.trim();
			}
			return null;
		});
		await sleep(4000);
		out.ui.periodRequests = requests.slice(before).filter(u => /dashboard/.test(u));
		out.ui.homeLinks = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")));
	} catch (error) {
		out.ui.homeError = String(error).slice(0, 300);
	}

	// Feature 3: /sessions page with a table and a sort control.
	const rows = () => page.evaluate(() => [...document.querySelectorAll("tbody tr, [role=row]")].map(r => r.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 60));
	try {
		const res = await page.goto(root + "/sessions", { waitUntil: "networkidle2", timeout: 60_000 });
		out.ui.sessionsStatus = res?.status();
		await sleep(3000);
		out.ui.sessionsText = await page.evaluate(() => document.body.innerText.slice(0, 20_000));
		out.ui.rowsInitial = await rows();
		const pick = async pattern => page.evaluate(source => {
			const re = new RegExp(source, "i");
			for (const select of document.querySelectorAll("select")) {
				const option = [...select.options].find(o => re.test(o.text.trim()) || re.test(o.value));
				if (option) {
					select.value = option.value;
					select.dispatchEvent(new Event("change", { bubbles: true }));
					return "select:" + option.text.trim();
				}
			}
			const control = [...document.querySelectorAll("button,[role=tab],[role=radio],a,label,th")].find(el => re.test((el.innerText ?? "").trim()));
			if (control) { control.click(); return "click:" + control.innerText.trim(); }
			return null;
		}, pattern);
		const before = requests.length;
		out.ui.sortCost = await pick("^(maior )?(custo|cost)");
		await sleep(3000);
		out.ui.rowsCost = await rows();
		out.ui.sortTokens = await pick("^(mais )?tokens");
		await sleep(3000);
		out.ui.rowsTokens = await rows();
		out.ui.sessionsRequests = requests.slice(before);
	} catch (error) {
		out.ui.sessionsError = String(error).slice(0, 300);
	}
	out.ui.pageErrors = errors;
	await browser.close();
}
fs.writeFileSync(outDir + "/contract.json", JSON.stringify(out));

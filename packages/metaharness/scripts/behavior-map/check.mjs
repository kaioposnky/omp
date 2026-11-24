// Runs inside the validation sandbox: waits for the site, loads it in headless Chrome and
// records what a visitor would get. Judgement happens on the host (validate.py).
// Usage: node check.mjs <puppeteer-core dir> <out dir> <wait seconds>
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

const [moduleDir, outDir, waitSeconds] = process.argv.slice(2);
const puppeteer = createRequire(moduleDir + "/")("puppeteer-core");
const URL_ROOT = "http://localhost:4321";
const result = { ready: false, readySeconds: null, responses: [], consoleErrors: [], pageErrors: [], pages: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = buffer => crypto.createHash("sha1").update(buffer).digest("hex");

const probe = async url => {
	try {
		return (await fetch(url, { signal: AbortSignal.timeout(5000) })).status;
	} catch {
		return null;
	}
};
const LOOPBACKS = { localhost: "http://localhost:4321", ipv4: "http://127.0.0.1:4321", ipv6: "http://[::1]:4321" };
const started = Date.now();
while (Date.now() - started < Number(waitSeconds) * 1000) {
	const statuses = await Promise.all(Object.values(LOOPBACKS).map(probe));
	if (statuses.some(status => status !== null && status < 500)) {
		result.ready = true;
		result.rootStatus = statuses.find(status => status !== null);
		result.loopback = Object.fromEntries(Object.keys(LOOPBACKS).map((key, index) => [key, statuses[index]]));
		break;
	}
	await sleep(2000);
}
result.readySeconds = Math.round((Date.now() - started) / 1000);

if (result.ready) {
	const browser = await puppeteer.launch({
		executablePath: "/usr/bin/google-chrome",
		headless: true,
		args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
	});
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 900 });
	await page.evaluateOnNewDocument(() => {
		window.__contexts = [];
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
			const context = original.call(this, type, ...rest);
			if (context) {
				window.__contexts.push(type);
				this.dataset.ctx = type;
			}
			return context;
		};
	});
	page.on("console", message => {
		if (message.type() === "error" && result.consoleErrors.length < 40) result.consoleErrors.push(message.text().slice(0, 400));
	});
	page.on("pageerror", error => {
		if (result.pageErrors.length < 40) result.pageErrors.push(String(error).slice(0, 400));
	});
	page.on("response", async response => {
		const url = response.url();
		const type = response.headers()["content-type"] ?? "";
		const entry = { url, status: response.status(), type };
		if (type.includes("json")) {
			try {
				entry.body = (await response.text()).slice(0, 400_000);
			} catch {}
		}
		if (result.responses.length < 400) result.responses.push(entry);
	});

	const inspect = async (url, name) => {
		const record = { url, name };
		try {
			const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
			record.status = response?.status();
		} catch (error) {
			record.navigationError = String(error).slice(0, 300);
		}
		await sleep(5000);
		Object.assign(
			record,
			await page.evaluate(() => {
				const canvases = [...document.querySelectorAll("canvas")].map(canvas => ({
					ctx: canvas.dataset.ctx ?? null,
					width: canvas.width,
					height: canvas.height,
				}));
				const svgs = [...document.querySelectorAll("svg")].map(svg => ({
					shapes: svg.querySelectorAll("path,rect,circle,line,polyline").length,
					width: svg.getBoundingClientRect().width,
					cls: String(svg.getAttribute("class") ?? "").slice(0, 60),
				}));
				const all = [...document.querySelectorAll("body *")].slice(0, 6000);
				const styles = all.map(element => getComputedStyle(element));
				const bars = all.filter((element, index) => {
					const box = element.getBoundingClientRect();
					const color = styles[index].backgroundColor;
					return element.children.length === 0 && box.width >= 3 && box.height >= 3 && (box.width <= 60 || box.height <= 24) && box.width * box.height >= 60 && color !== "rgba(0, 0, 0, 0)" && !element.innerText;
				}).length;
				return {
					css3d: styles.filter(style => style.transform.startsWith("matrix3d") || style.transformStyle === "preserve-3d" || style.perspective !== "none").length,
					runningAnimations: document.getAnimations().filter(animation => animation.playState === "running").length,
					barLikeElements: bars,
					title: document.title,
					text: document.body.innerText.slice(0, 30_000),
					canvases,
					chartSvgs: svgs.filter(svg => svg.shapes >= 4 && svg.width >= 150),
					contexts: window.__contexts,
					height: document.documentElement.scrollHeight,
					links: [...new Set([...document.querySelectorAll("a[href]")].map(a => a.href))].slice(0, 30),
				};
			}),
		);
		await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
		record.animatedCanvases = [];
		const handles = (await page.$$("canvas")).slice(0, 6);
		for (const [index, handle] of handles.entries()) {
			try {
				await handle.scrollIntoView();
				const ctx = await handle.evaluate(canvas => canvas.dataset.ctx ?? null);
				const first = hash(await handle.screenshot());
				await sleep(1200);
				const second = hash(await handle.screenshot());
				if (first !== second) {
					record.animatedCanvases.push(ctx);
					await handle.screenshot({ path: `${outDir}/${name}-canvas-${index}.png` });
				}
			} catch (error) {
				record.canvasError = String(error).slice(0, 200);
			}
		}
		record.glAnimated = record.animatedCanvases.some(ctx => String(ctx).startsWith("webgl") || ctx === "webgpu");
		result.pages.push(record);
		return record;
	};

	const home = await inspect(URL_ROOT, "home");
	// A visitor comparing totals would pick the widest period the page offers.
	const ALL_TIME = /^(tudo|todo o per[ií]odo|todos|todo|all( time)?|total|m[aá]ximo|max|sempre)$/i;
	result.widestPeriod = await page.evaluate(source => {
		const pattern = new RegExp(source, "i");
		for (const select of document.querySelectorAll("select")) {
			const option = [...select.options].find(candidate => pattern.test(candidate.text.trim()));
			if (option) {
				select.value = option.value;
				select.dispatchEvent(new Event("input", { bubbles: true }));
				select.dispatchEvent(new Event("change", { bubbles: true }));
				return "select:" + option.text.trim();
			}
		}
		const control = [...document.querySelectorAll("button,[role=tab],[role=option],[role=radio],label,a")].find(candidate => pattern.test((candidate.innerText ?? "").trim()));
		if (control) {
			control.click();
			return "click:" + control.innerText.trim();
		}
		return null;
	}, ALL_TIME.source);
	if (result.widestPeriod) {
		await sleep(4000);
		home.textWidest = await page.evaluate(() => document.body.innerText.slice(0, 30_000));
		await page.screenshot({ path: `${outDir}/home-all-time.png`, fullPage: true });
	}
	const extra = (home.links ?? []).filter(link => link.startsWith(URL_ROOT) && !link.includes("#") && new URL(link).pathname !== "/");
	let index = 0;
	for (const link of extra.slice(0, 4)) await inspect(link, `page-${++index}`);
	await browser.close();
}
fs.writeFileSync(`${outDir}/check.json`, JSON.stringify(result));

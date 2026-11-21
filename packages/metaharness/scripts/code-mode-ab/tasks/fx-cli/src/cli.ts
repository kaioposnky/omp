import { parseArgs } from "./args";
import { jobs } from "./data";
import { renderTable } from "./report";

const options = parseArgs(process.argv.slice(2));
const selected = options.limit === undefined ? jobs : jobs.slice(0, options.limit);
console.log(renderTable(selected));

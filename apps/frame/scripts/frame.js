#!/usr/bin/env node
import { main } from "../cli/run.js";
process.exitCode = await main();

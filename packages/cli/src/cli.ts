#!/usr/bin/env node
import { runCli } from './run.js'
import { createNodeContext } from './node-context.js'

const exitCode = await runCli(process.argv.slice(2), createNodeContext())
process.exitCode = exitCode

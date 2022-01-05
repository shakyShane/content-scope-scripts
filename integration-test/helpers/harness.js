import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as http from 'node:http'
import { spawnSync } from 'node:child_process'
import puppeteer from 'puppeteer'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000
if (process.env.KEEP_OPEN) {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000 * 1000
}

const DATA_DIR_PREFIX = 'ddg-temp-'

export async function setup () {
    const tmpDirPrefix = path.join(os.tmpdir(), DATA_DIR_PREFIX)
    const dataDir = fs.mkdtempSync(tmpDirPrefix)
    const puppeteerOps = {
        args: [
            `--user-data-dir=${dataDir}`
        ],
        headless: false
    }

    // github actions
    if (process.env.CI) {
        puppeteerOps.args.push('--no-sandbox')
    }

    const browser = await puppeteer.launch(puppeteerOps)
    const servers = []

    async function teardown () {
        if (process.env.KEEP_OPEN) {
            return new Promise((resolve) => {
                browser.on('disconnected', async () => {
                    await teardownInternal()
                    resolve(undefined)
                })
            })
        } else {
            await teardownInternal()
        }
    }

    async function teardownInternal () {
        await Promise.all(servers.map(server => server.close()))
        await browser.close()

        // necessary so e.g. local storage
        // doesn't carry over between test runs
        spawnSync('rm', ['-rf', dataDir])
    }

    function setupServer (port) {
        const server = http.createServer(function (req, res) {
            if (!req.url) throw new Error('unreachable')
            const url = new URL(req.url, `http://${req.headers.host}`)
            const importUrl = new URL(import.meta.url)
            const dirname = importUrl.pathname.replace(/\/[^/]*$/, '')
            fs.readFile(path.join(dirname, '../pages', url.pathname), (err, data) => {
                if (err) {
                    res.writeHead(404)
                    res.end(JSON.stringify(err))
                    return
                }
                res.writeHead(200)
                res.end(data)
            })
        }).listen(port)
        servers.push(server)
        return server
    }

    return { browser, teardown, setupServer }
}

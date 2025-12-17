const { chromium } = require('playwright');
const fs = require('fs');

// Simple debug helper controlled by env:
//   DEBUG=true node src/download.js
//   LOG_LEVEL=debug node src/download.js
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'debug';
const debug = (...args) => { if (true) console.log('[debug]', ...args); };

const year = "2025"
const siteRoot = "https://adventofcode.com"
const leaderboardsPage = siteRoot + "/" + year + "/leaderboard/private"
const jsonDir = "json"
const cookiesFile = "cookies.json"

const run = async () => {
    debug('Starting download', { year, leaderboardsPage, jsonDir, cookiesFile });
    const usingCookies = fs.existsSync(cookiesFile);
    debug('Using cookies file present:', usingCookies);

    const browser = await chromium.launch({ headless: false });
    let page;
    try {
        const context = await browser.newContext(
            usingCookies ? { storageState: cookiesFile } : {}
        );

        page = await context.newPage();

        // Surface browser console when debugging
        page.on('console', msg => debug('page.console:', msg.type(), msg.text()));
        page.on('response', resp => {
            const url = resp.url();
            if (url.includes('/leaderboard/')) debug('HTTP', resp.status(), url);
        });

        debug('Navigating to leaderboards page:', leaderboardsPage);
        await page.goto(leaderboardsPage);
        debug('Arrived at URL:', page.url());

        // Optional grace period to inspect the page before scraping
        const WAIT_BEFORE_SCRAPE_MS = Number(10000);
        if (WAIT_BEFORE_SCRAPE_MS > 0) {
            console.log(`[info] Waiting ${WAIT_BEFORE_SCRAPE_MS}ms before scanning the page (set WAIT_BEFORE_SCRAPE_MS env to adjust).`);
            await page.waitForTimeout(WAIT_BEFORE_SCRAPE_MS);
        }

        if (page.url() != leaderboardsPage) {
            console.log("!!! PLEASE LOGIN AND GO TO PRIVATE LEADERBOARDS !!!");
            debug('Waiting for login redirect back to:', leaderboardsPage);
            await page.waitForNavigation({ url: leaderboardsPage, timeout: 600000 });
            await page.context().storageState({ path: cookiesFile });
            console.log(`Saved authentication state to '${cookiesFile}'`);
        }

        if (!fs.existsSync(jsonDir)){
            debug('Creating json directory:', jsonDir);
            fs.mkdirSync(jsonDir, { recursive: true });
        } else {
            debug('json directory already exists:', jsonDir);
        }

        const list = page.locator('a:text("[View]")');
        const count = await list.count();
        debug(`Found ${count} "[View]" links`);

        // If nothing was found, optionally pause to allow manual inspection/actions
        const WAIT_ON_EMPTY_MS = Number(process.env.WAIT_ON_EMPTY_MS || 0);
        if (count === 0 && WAIT_ON_EMPTY_MS > 0) {
            console.log(`[info] Found 0 "[View]" links. Waiting ${WAIT_ON_EMPTY_MS}ms so you can inspect the page... (set WAIT_ON_EMPTY_MS env to adjust)`);
            await page.waitForTimeout(WAIT_ON_EMPTY_MS);
        }

        let urls = [];
        for (var i = 0; i < count; i++) {
            const element = await list.nth(i);
            const href = await element.getAttribute('href');
            debug('Found leaderboard link href:', href);
            urls.push(href + '.json');
        }
        debug('Resolved JSON urls:', urls);

        for (const i in urls) {
            const url = urls[i];
            const file = jsonDir +'/' + year + url.substring(url.lastIndexOf('/'));
            console.log(`Saving leaderboard ${url} -> ${file}`);
            const fullUrl = siteRoot + url;
            debug('Fetching:', fullUrl);
            await page.goto(fullUrl);
            const content = await page.innerText('pre');
            debug('Fetched content length:', content?.length ?? 0);
            try {
                await fs.promises.writeFile(file, content, 'utf-8');
                debug('Wrote file:', file);
            } catch (err) {
                console.error('Failed to write file', file, err);
            }
        }
    } finally {
        debug('Closing browser');
        await browser.close();
    }
};

run();

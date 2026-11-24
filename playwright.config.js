const { defineConfig } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findCachedChromium() {
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
        return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    const cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
    if (!fs.existsSync(cacheDir)) return undefined;

    const dirs = fs.readdirSync(cacheDir)
        .filter(d => d.startsWith('chromium-'))
        .sort()
        .reverse();

    for (const dir of dirs) {
        const candidates = [
            path.join(cacheDir, dir, 'chrome-linux64', 'chrome'),
            path.join(cacheDir, dir, 'chrome-linux', 'chrome')
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return undefined;
}

const executablePath = findCachedChromium();

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 90000,
    expect: { timeout: 20000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost',
        headless: true,
        launchOptions: {
            ...(executablePath ? { executablePath } : {}),
            args: [
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--no-sandbox'
            ]
        }
    }
});
